import type { Request, Response } from "express";

import { env } from "../../config/env.js";
import { Booking } from "../../models/Booking.js";
import { Tour } from "../../models/Tour.js";
import { Transaction } from "../../models/Transaction.js";
import { assertCanPayWithPromo } from "../../services/promoUsage.service.js";
import * as razorpay from "../../services/razorpay.service.js";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  const { bookingId, mode } = req.body as { bookingId: string; mode: "full" | "token" | "balance" };

  const booking = await Booking.findOne({ _id: bookingId, customerId: req.customer!.sub });
  if (!booking) throw ApiError.notFound("Booking not found");
  if (booking.paymentStatus === "paid" || booking.status === "cancelled") {
    throw ApiError.badRequest("This booking is no longer payable");
  }

  // "full" only makes sense before anything's been paid — once a token
  // payment has landed, the only way to finish paying is "balance".
  if (mode === "full" && booking.amountPaid > 0) {
    throw ApiError.badRequest("Part of this booking is already paid — pay the remaining balance instead");
  }

  const amount =
    mode === "token"
      ? booking.pricing.tokenAmount
      : mode === "balance"
        ? Math.round((booking.pricing.finalAmount - booking.amountPaid) * 100) / 100
        : booking.pricing.finalAmount;

  if (mode === "token" && amount <= 0) throw ApiError.badRequest("Token payment isn't available for this booking");
  if (mode === "balance" && amount <= 0) throw ApiError.badRequest("Nothing outstanding on this booking");

  // Last moment before money can move: if this booking carries a promo code
  // and hasn't paid anything yet, make sure the code's usage limit hasn't been
  // used up in the meantime (an unpaid booking's reservation can expire).
  await assertCanPayWithPromo(booking);

  const order = await razorpay.createOrder(amount, booking.bookingRef, {
    bookingId: String(booking._id),
    mode,
  });

  await Transaction.create({
    bookingId: booking._id,
    customerId: booking.customerId,
    razorpayOrderId: order.id,
    amount,
    type: mode,
    status: "created",
  });

  const checkoutParams = new URLSearchParams({
    order_id: String(order.id),
    amount: String(order.amount),
    key: env.RAZORPAY_KEY_ID,
    name: booking.contactName,
    email: booking.contactEmail,
    contact: booking.contactPhone,
    booking_id: String(booking._id),
  });

  res.status(201).json({
    orderId: order.id,
    amount,
    currency: "INR",
    checkoutUrl: `${req.protocol}://${req.get("host")}/checkout?${checkoutParams.toString()}`,
  });
});

/**
 * Applies a captured payment to its booking — exactly once per transaction.
 *
 * The app's /verify call and Razorpay's webhook can both report the same
 * payment, in either order. Claiming the transaction atomically (only the
 * caller that flips it to "paid" proceeds) stops the second report from adding
 * the amount again, which used to be able to double `amountPaid`.
 */
async function confirmBookingPayment(
  booking: InstanceType<typeof Booking>,
  txn: InstanceType<typeof Transaction>,
): Promise<InstanceType<typeof Booking>> {
  const set: Record<string, unknown> = { status: "paid" };
  if (txn.razorpayPaymentId) set.razorpayPaymentId = txn.razorpayPaymentId;
  if (txn.razorpaySignature) set.razorpaySignature = txn.razorpaySignature;
  if (txn.rawWebhookPayload) set.rawWebhookPayload = txn.rawWebhookPayload;

  const claimed = await Transaction.findOneAndUpdate({ _id: txn._id, status: { $ne: "paid" } }, { $set: set });
  if (!claimed) return (await Booking.findById(booking._id)) ?? booking; // already applied

  const updated = await Booking.findByIdAndUpdate(booking._id, { $inc: { amountPaid: txn.amount } }, { new: true });
  if (!updated) return booking;

  updated.amountPaid = Math.round(updated.amountPaid * 100) / 100;
  updated.paymentStatus = updated.amountPaid >= updated.pricing.finalAmount ? "paid" : "partial";
  // Money is in, so the promo use is now counted by paymentStatus; the
  // temporary reservation has done its job.
  updated.promoHoldUntil = undefined;
  updated.promoHoldFirm = undefined;

  // Only decrement seats — and only once — the first time a booking is confirmed.
  if (updated.status === "pending_payment") {
    updated.status = "confirmed";
    if (updated.tourId) {
      await Tour.updateOne(
        { _id: updated.tourId, seatsAvailable: { $gte: updated.travellers.length } },
        { $inc: { seatsAvailable: -updated.travellers.length } },
      );
    }
    const { rewardReferralIfQualifying } = await import("../../services/referral.service.js");
    await rewardReferralIfQualifying(String(updated.customerId), String(updated._id));
  }
  await updated.save();
  return updated;
}

export const verify = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as
    | { status: "success"; bookingId: string; razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
    | { status: "failed"; bookingId: string; razorpay_order_id?: string };

  const booking = await Booking.findOne({ _id: body.bookingId, customerId: req.customer!.sub });
  if (!booking) throw ApiError.notFound("Booking not found");

  if (body.status === "failed") {
    if (body.razorpay_order_id) {
      // Only an order still waiting on payment can be marked failed — a late
      // "cancelled" callback must never overwrite one that already succeeded.
      await Transaction.updateOne({ razorpayOrderId: body.razorpay_order_id, status: "created" }, { status: "failed" });
    }
    return res.json({ item: booking, paymentStatus: "failed" });
  }

  const txn = await Transaction.findOne({ razorpayOrderId: body.razorpay_order_id, bookingId: booking._id });
  if (!txn) throw ApiError.notFound("Payment order not found");
  if (txn.status === "paid") return res.json({ item: booking, paymentStatus: "success" });

  const signatureValid = razorpay.verifyPaymentSignature(
    body.razorpay_order_id,
    body.razorpay_payment_id,
    body.razorpay_signature,
  );
  if (!signatureValid) {
    txn.status = "failed";
    await txn.save();
    throw ApiError.badRequest("Payment signature verification failed");
  }

  // Defends against a forged client-side signature match alone, same as the
  // legacy PHP flow: independently re-confirm with Razorpay's own API.
  const payment = await razorpay.fetchPayment(body.razorpay_payment_id);
  const amountMatches = payment.amount === Math.round(txn.amount * 100);
  const statusOk = payment.status === "captured" || payment.status === "authorized";
  if (!amountMatches || !statusOk || payment.order_id !== body.razorpay_order_id) {
    txn.status = "failed";
    await txn.save();
    throw ApiError.badRequest("Payment could not be verified");
  }

  txn.razorpayPaymentId = body.razorpay_payment_id;
  txn.razorpaySignature = body.razorpay_signature;
  const updated = await confirmBookingPayment(booking, txn);

  res.json({ item: updated, paymentStatus: "success" });
});

export const listMine = asyncHandler(async (req: Request, res: Response) => {
  const bookingIds = await Booking.find({ customerId: req.customer!.sub }).distinct("_id");
  // Only payments that actually went through (and refunds). Checkouts that
  // were opened and abandoned are "created"/"failed" orders for the full or
  // balance amount — listing them showed large phantom "pending" amounts
  // instead of what the customer really paid.
  const transactions = await Transaction.find({
    bookingId: { $in: bookingIds },
    status: { $in: ["paid", "refunded"] },
  })
    .populate("bookingId", "bookingRef itinerarySnapshot paymentStatus status amountPaid pricing.finalAmount")
    .sort({ createdAt: -1 });
  res.json({ items: transactions });
});

export const webhook = asyncHandler(async (req: Request, res: Response) => {
  const signature = req.headers["x-razorpay-signature"] as string;
  const rawBody = req.body as Buffer;

  if (!razorpay.verifyWebhookSignature(rawBody, signature)) {
    throw ApiError.unauthorized("Invalid webhook signature");
  }

  const event = JSON.parse(rawBody.toString("utf8"));
  const payload = event.payload?.payment?.entity ?? event.payload?.refund?.entity;
  const orderId: string | undefined = payload?.order_id;
  if (!orderId) return res.json({ ok: true });

  const txn = await Transaction.findOne({ razorpayOrderId: orderId });
  if (!txn) return res.json({ ok: true });
  txn.rawWebhookPayload = event;

  // Reconciliation fallback only — the primary confirmation path is
  // POST /payments/verify from the app itself. This just catches the case
  // where the customer closed the app before that call could complete.
  if (event.event === "payment.captured" && txn.status !== "paid") {
    const booking = await Booking.findById(txn.bookingId);
    if (booking) {
      txn.razorpayPaymentId = payload.id;
      await confirmBookingPayment(booking, txn);
    }
  } else if (event.event === "payment.failed" && txn.status === "created") {
    txn.status = "failed";
    await txn.save();
  } else {
    await txn.save();
  }

  res.json({ ok: true });
});
