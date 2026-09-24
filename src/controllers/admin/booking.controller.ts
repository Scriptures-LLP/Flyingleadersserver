import type { Request, Response } from "express";

import { Booking } from "../../models/Booking.js";
import { Transaction } from "../../models/Transaction.js";
import { recordOfficePayment, round2, voidOfficePayment } from "../../services/bookingPayment.service.js";
import { notifyRefundIssued } from "../../services/notify.service.js";
import * as razorpay from "../../services/razorpay.service.js";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const bookings = await Booking.find()
    .populate("tourId", "title slug")
    .populate("customerId", "name email")
    .sort({ createdAt: -1 });
  res.json({ items: bookings });
});

/**
 * What can still be refunded through Razorpay. Only payments that went through
 * Razorpay can be — money handed over at the office has no Razorpay payment to
 * refund against — and each captured payment can be refunded only up to what
 * hasn't already been refunded on it. Newest payment first.
 */
async function onlineRefundState(bookingId: unknown) {
  const [payments, refunds] = await Promise.all([
    Transaction.find({
      bookingId,
      status: "paid",
      channel: { $ne: "office" },
      razorpayPaymentId: { $exists: true, $ne: null },
    }).sort({ createdAt: -1 }),
    Transaction.find({ bookingId, type: "refund", status: "refunded" }),
  ]);
  const refundable = (p: (typeof payments)[number]) =>
    round2(p.amount - refunds.filter((r) => r.razorpayPaymentId === p.razorpayPaymentId).reduce((n, r) => n + r.amount, 0));
  const target = payments.find((p) => refundable(p) > 0);
  return { target, maxOnline: target ? refundable(target) : 0 };
}

export const get = asyncHandler(async (req: Request, res: Response) => {
  const booking = await Booking.findById(req.params.id)
    .populate("tourId", "title slug")
    .populate("customerId", "name email");
  if (!booking) throw ApiError.notFound("Booking not found");
  const transactions = await Transaction.find({ bookingId: booking._id })
    .populate("office.recordedBy", "name")
    .populate("office.voidedBy", "name")
    .sort({ createdAt: -1 });
  const { maxOnline } = await onlineRefundState(booking._id);
  res.json({ item: booking, transactions, onlineRefundable: Math.min(maxOnline, booking.amountPaid) });
});

export const recordPayment = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as {
    amount: number;
    method: "cash" | "upi" | "bank_transfer" | "card" | "cheque" | "other";
    reference?: string;
    note?: string;
    receivedAt?: Date;
  };
  const result = await recordOfficePayment(String(req.params.id), {
    ...body,
    receivedAt: body.receivedAt ?? new Date(),
    adminId: req.admin!.sub,
  });
  res.status(201).json({ item: result.booking, transaction: result.transaction });
});

export const voidPayment = asyncHandler(async (req: Request, res: Response) => {
  const { reason } = req.body as { reason: string };
  const result = await voidOfficePayment(String(req.params.id), String(req.params.txnId), req.admin!.sub, reason);
  res.json({ item: result.booking, transaction: result.transaction });
});

export const refund = asyncHandler(async (req: Request, res: Response) => {
  const { amount, reason } = req.body as { amount?: number; reason?: string };

  const booking = await Booking.findById(req.params.id);
  if (!booking) throw ApiError.notFound("Booking not found");

  const { target: paidTxn, maxOnline } = await onlineRefundState(booking._id);
  if (!paidTxn?.razorpayPaymentId) {
    throw ApiError.badRequest(
      "There is no online (Razorpay) payment left to refund on this booking. " +
        "Money paid at the office has to be refunded at the office.",
    );
  }

  const refundAmount = amount ?? Math.min(booking.amountPaid, maxOnline);
  if (refundAmount <= 0) throw ApiError.badRequest("Enter a refund amount greater than 0");
  if (refundAmount > booking.amountPaid) throw ApiError.badRequest("Refund amount exceeds amount paid");
  if (refundAmount > maxOnline) {
    throw ApiError.badRequest(
      `Only ₹${maxOnline.toLocaleString("en-IN")} can be refunded through Razorpay on this booking. ` +
        "Anything paid at the office has to be refunded at the office.",
    );
  }

  const rzpRefund = await razorpay.createRefund(paidTxn.razorpayPaymentId, refundAmount);

  await Transaction.create({
    bookingId: booking._id,
    customerId: booking.customerId,
    razorpayOrderId: paidTxn.razorpayOrderId,
    razorpayPaymentId: paidTxn.razorpayPaymentId,
    amount: refundAmount,
    type: "refund",
    status: "refunded",
    refund: {
      razorpayRefundId: rzpRefund.id,
      amount: refundAmount,
      status: rzpRefund.status,
      initiatedBy: req.admin!.sub,
      reason,
      initiatedAt: new Date(),
    },
  });

  booking.amountPaid = round2(booking.amountPaid - refundAmount);
  const fullyRefunded = booking.amountPaid <= 0;
  booking.paymentStatus = fullyRefunded ? "refunded" : "refund_initiated";
  if (fullyRefunded) booking.status = "cancelled";
  await booking.save();

  // A fully refunded booking that had used wallet credit gives that credit back.
  const credit = booking.pricing.walletCreditApplied ?? 0;
  if (fullyRefunded && credit > 0) {
    const { restoreWalletCredit } = await import("../../services/referral.service.js");
    await restoreWalletCredit(String(booking.customerId), credit, String(booking._id));
  }

  void notifyRefundIssued(String(booking._id), refundAmount);

  res.json({ item: booking });
});
