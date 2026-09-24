import { Booking } from "../models/Booking.js";
import { Tour } from "../models/Tour.js";
import { Transaction, type OFFICE_PAYMENT_METHODS } from "../models/Transaction.js";
import { ApiError } from "../utils/ApiError.js";
import { assertCanPayWithPromo } from "./promoUsage.service.js";

type BookingDoc = InstanceType<typeof Booking>;
export type OfficePaymentMethod = (typeof OFFICE_PAYMENT_METHODS)[number];

export const round2 = (n: number) => Math.round(n * 100) / 100;

// Floating-point slack when comparing rupee amounts in a Mongo filter.
const EPS = 0.005;

/**
 * Brings a booking up to date after money has been added to its `amountPaid`
 * — whether that money came through Razorpay in the app or was taken at the
 * office. One place, so both routes behave identically: payment status, the
 * promo reservation, the first-payment confirmation (seats + referral reward).
 */
export async function finalizePaidBooking(updated: BookingDoc): Promise<BookingDoc> {
  updated.amountPaid = round2(updated.amountPaid);
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
    const { rewardReferralIfQualifying } = await import("./referral.service.js");
    await rewardReferralIfQualifying(String(updated.customerId), String(updated._id));
  }
  await updated.save();
  return updated;
}

export type OfficePaymentInput = {
  amount: number;
  method: OfficePaymentMethod;
  reference?: string;
  note?: string;
  receivedAt: Date;
  adminId: string;
};

/**
 * Records money the customer handed over at the office (cash, UPI, bank
 * transfer…) against a booking. It lands in the same `amountPaid` the app reads,
 * so the customer sees their new balance and payment history straight away.
 *
 * Never lets the booking be over-collected: the amount is checked against what's
 * outstanding, and the increment itself is conditional so two staff entering a
 * payment at the same moment can't both squeeze in.
 */
export async function recordOfficePayment(bookingId: string, input: OfficePaymentInput) {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw ApiError.notFound("Booking not found");

  if (booking.status === "cancelled") {
    throw ApiError.badRequest("This booking is cancelled, so a payment can't be recorded on it");
  }
  if (booking.paymentStatus === "paid") throw ApiError.badRequest("This booking is already fully paid");
  if (booking.paymentStatus !== "unpaid" && booking.paymentStatus !== "partial") {
    throw ApiError.badRequest("A refund has been issued on this booking, so a payment can't be recorded on it");
  }

  const amount = round2(input.amount);
  const finalAmount = booking.pricing.finalAmount;
  const remaining = round2(finalAmount - booking.amountPaid);
  if (remaining <= 0) throw ApiError.badRequest("Nothing is outstanding on this booking");
  if (amount > remaining) {
    throw ApiError.badRequest(`That's more than the remaining balance of ₹${remaining.toLocaleString("en-IN")}`);
  }

  // First money on a booking that used a promo code: the same usage-limit gate
  // an online payment goes through, so the office can't be the loophole.
  await assertCanPayWithPromo(booking);

  const type = booking.amountPaid > 0 ? "balance" : amount >= finalAmount ? "full" : "token";

  const updated = await Booking.findOneAndUpdate(
    {
      _id: booking._id,
      status: { $ne: "cancelled" },
      paymentStatus: { $in: ["unpaid", "partial"] },
      amountPaid: { $lte: round2(finalAmount - amount) + EPS },
    },
    { $inc: { amountPaid: amount } },
    { new: true },
  );
  if (!updated) {
    throw ApiError.conflict("This booking just changed — reload it and check the remaining balance, then try again");
  }

  let transaction;
  try {
    transaction = await Transaction.create({
      bookingId: booking._id,
      customerId: booking.customerId,
      channel: "office",
      amount,
      type,
      status: "paid",
      office: {
        method: input.method,
        reference: input.reference || undefined,
        note: input.note || undefined,
        receivedAt: input.receivedAt,
        recordedBy: input.adminId,
      },
    });
  } catch (err) {
    // Never leave money on the booking that has no record behind it.
    await Booking.updateOne({ _id: booking._id }, { $inc: { amountPaid: -amount } });
    throw err;
  }

  return { booking: await finalizePaidBooking(updated), transaction };
}

/**
 * Reverses an office payment that was entered by mistake (wrong amount, wrong
 * booking). The entry stays in the books marked "voided" with who did it and
 * why — it is never deleted — and the booking's paid amount drops back.
 */
export async function voidOfficePayment(bookingId: string, transactionId: string, adminId: string, reason: string) {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw ApiError.notFound("Booking not found");

  const txn = await Transaction.findOne({ _id: transactionId, bookingId: booking._id });
  if (!txn || txn.channel !== "office") throw ApiError.notFound("Office payment not found");
  if (txn.status !== "paid") throw ApiError.badRequest("This payment has already been voided");

  if (booking.status === "cancelled" || booking.paymentStatus === "refunded" || booking.paymentStatus === "refund_initiated") {
    throw ApiError.badRequest("A refund has been issued on this booking, so this payment can't be voided");
  }

  // Claim first, so two admins voiding the same entry can't both subtract it.
  const claimed = await Transaction.findOneAndUpdate(
    { _id: txn._id, channel: "office", status: "paid" },
    { $set: { status: "voided", "office.voidedAt": new Date(), "office.voidedBy": adminId, "office.voidReason": reason } },
  );
  if (!claimed) throw ApiError.badRequest("This payment has already been voided");

  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, amountPaid: { $gte: txn.amount - EPS } },
    { $inc: { amountPaid: -txn.amount } },
    { new: true },
  );
  if (!updated) {
    await Transaction.updateOne(
      { _id: txn._id },
      {
        $set: { status: "paid" },
        $unset: { "office.voidedAt": 1, "office.voidedBy": 1, "office.voidReason": 1 },
      },
    );
    throw ApiError.badRequest("This payment can't be voided because less than its amount is left on the booking");
  }

  updated.amountPaid = Math.max(0, round2(updated.amountPaid));
  updated.paymentStatus =
    updated.amountPaid <= 0 ? "unpaid" : updated.amountPaid >= updated.pricing.finalAmount ? "paid" : "partial";
  await updated.save();

  const transaction = await Transaction.findById(txn._id);
  return { booking: updated, transaction };
}
