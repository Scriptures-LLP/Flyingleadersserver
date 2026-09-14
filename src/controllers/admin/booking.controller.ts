import type { Request, Response } from "express";

import { Booking } from "../../models/Booking.js";
import { Transaction } from "../../models/Transaction.js";
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

export const get = asyncHandler(async (req: Request, res: Response) => {
  const booking = await Booking.findById(req.params.id)
    .populate("tourId", "title slug")
    .populate("customerId", "name email");
  if (!booking) throw ApiError.notFound("Booking not found");
  const transactions = await Transaction.find({ bookingId: booking._id }).sort({ createdAt: -1 });
  res.json({ item: booking, transactions });
});

export const refund = asyncHandler(async (req: Request, res: Response) => {
  const { amount, reason } = req.body as { amount?: number; reason?: string };

  const booking = await Booking.findById(req.params.id);
  if (!booking) throw ApiError.notFound("Booking not found");

  const paidTxn = await Transaction.findOne({ bookingId: booking._id, status: "paid" }).sort({ createdAt: -1 });
  if (!paidTxn?.razorpayPaymentId) throw ApiError.badRequest("No captured payment found for this booking");

  const refundAmount = amount ?? booking.amountPaid;
  if (refundAmount > booking.amountPaid) throw ApiError.badRequest("Refund amount exceeds amount paid");

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

  booking.amountPaid -= refundAmount;
  const fullyRefunded = booking.amountPaid <= 0;
  booking.paymentStatus = fullyRefunded ? "refunded" : "refund_initiated";
  if (fullyRefunded) booking.status = "cancelled";
  await booking.save();

  res.json({ item: booking });
});
