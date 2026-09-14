import type { Request, Response } from "express";

import { env } from "../../config/env.js";
import { Booking } from "../../models/Booking.js";
import { Tour } from "../../models/Tour.js";
import { Transaction } from "../../models/Transaction.js";
import * as razorpay from "../../services/razorpay.service.js";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  const { bookingId, mode } = req.body as { bookingId: string; mode: "full" | "token" };

  const booking = await Booking.findOne({ _id: bookingId, customerId: req.customer!.sub });
  if (!booking) throw ApiError.notFound("Booking not found");
  if (booking.status !== "pending_payment") throw ApiError.badRequest("This booking is no longer payable");

  const amount = mode === "token" ? booking.pricing.tokenAmount : booking.pricing.finalAmount;
  if (mode === "token" && amount <= 0) throw ApiError.badRequest("Token payment isn't available for this booking");

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

async function confirmBookingPayment(booking: InstanceType<typeof Booking>, txn: InstanceType<typeof Transaction>) {
  txn.status = "paid";
  await txn.save();

  booking.amountPaid += txn.amount;
  booking.paymentStatus = booking.amountPaid >= booking.pricing.finalAmount ? "paid" : "partial";

  // Only decrement seats — and only once — the first time a booking is confirmed.
  if (booking.status === "pending_payment") {
    booking.status = "confirmed";
    if (booking.tourId) {
      await Tour.updateOne(
        { _id: booking.tourId, seatsAvailable: { $gte: booking.travellers.length } },
        { $inc: { seatsAvailable: -booking.travellers.length } },
      );
    }
  }
  await booking.save();
}

export const verify = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as
    | { status: "success"; bookingId: string; razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
    | { status: "failed"; bookingId: string; razorpay_order_id?: string };

  const booking = await Booking.findOne({ _id: body.bookingId, customerId: req.customer!.sub });
  if (!booking) throw ApiError.notFound("Booking not found");

  if (body.status === "failed") {
    if (body.razorpay_order_id) {
      await Transaction.updateOne({ razorpayOrderId: body.razorpay_order_id }, { status: "failed" });
    }
    return res.json({ item: booking, paymentStatus: "failed" });
  }

  const txn = await Transaction.findOne({ razorpayOrderId: body.razorpay_order_id, bookingId: booking._id });
  if (!txn) throw ApiError.notFound("Payment order not found");

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
  await confirmBookingPayment(booking, txn);

  res.json({ item: booking, paymentStatus: "success" });
});

export const listMine = asyncHandler(async (req: Request, res: Response) => {
  const bookingIds = await Booking.find({ customerId: req.customer!.sub }).distinct("_id");
  const transactions = await Transaction.find({ bookingId: { $in: bookingIds } }).sort({ createdAt: -1 });
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
