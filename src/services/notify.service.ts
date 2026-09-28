import { Booking } from "../models/Booking.js";
import { Customer } from "../models/Customer.js";

import { deliverToCustomers } from "./push.service.js";

/**
 * The notifications the system sends by itself when something happens to a
 * customer's account. Each is fire-and-forget: it logs and swallows its own
 * failures, so a notification problem can never break the payment, refund or
 * referral that triggered it.
 */

const inr = (n: number) => `₹${(Math.round(n * 100) / 100).toLocaleString("en-IN")}`;
const safely = async (label: string, fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (err) {
    console.error(`[notify] ${label} failed:`, err);
  }
};

const tourTitle = (b: { itinerarySnapshot?: unknown }) => (b.itinerarySnapshot as { title?: string } | undefined)?.title ?? "your trip";
const remainingOf = (b: { pricing: { finalAmount: number }; amountPaid: number }) =>
  Math.max(0, Math.round((b.pricing.finalAmount - b.amountPaid) * 100) / 100);

/** A payment landed on a booking — paid in the app, or recorded by the office. */
export function notifyPaymentReceived(bookingId: string, amount: number, via: "app" | "office") {
  return safely("payment received", async () => {
    const b = await Booking.findById(bookingId);
    if (!b) return;
    const left = remainingOf(b);
    const balance = left > 0 ? ` Balance: ${inr(left)}.` : " You're fully paid.";
    await deliverToCustomers([String(b.customerId)], {
      category: "bookingUpdates",
      title: via === "office" ? "Payment recorded" : "Payment received",
      body:
        via === "office"
          ? `We've recorded your ${inr(amount)} payment at our office for ${tourTitle(b)}.${balance}`
          : `We received ${inr(amount)} for ${tourTitle(b)} (${b.bookingRef}).${balance}`,
      data: { screen: "booking", bookingId: String(b._id) },
    });
  });
}

/** A refund was started on a booking — and, usually, the booking was cancelled with it. */
export function notifyRefundIssued(bookingId: string, amount: number, cancelled = false) {
  return safely("refund", async () => {
    const b = await Booking.findById(bookingId);
    if (!b) return;
    await deliverToCustomers([String(b.customerId)], {
      category: "bookingUpdates",
      title: cancelled ? "Booking cancelled" : "Refund initiated",
      body: cancelled
        ? `Your booking for ${tourTitle(b)} (${b.bookingRef}) has been cancelled and a refund of ${inr(amount)} has been initiated.`
        : `Your refund of ${inr(amount)} for ${tourTitle(b)} (${b.bookingRef}) has been initiated.`,
      data: { screen: "booking", bookingId: String(b._id) },
    });
  });
}

/** A booking was cancelled by the office without a refund going through the app. */
export function notifyBookingCancelled(bookingId: string) {
  return safely("booking cancelled", async () => {
    const b = await Booking.findById(bookingId);
    if (!b) return;
    await deliverToCustomers([String(b.customerId)], {
      category: "bookingUpdates",
      title: "Booking cancelled",
      body: `Your booking for ${tourTitle(b)} (${b.bookingRef}) has been cancelled. Contact us if you have any questions.`,
      data: { screen: "booking", bookingId: String(b._id) },
    });
  });
}

/** The referrer just earned wallet credit because their friend paid for a first booking. */
export function notifyReferralReward(referrerId: string, amount: number, refereeId: string) {
  return safely("referral reward", async () => {
    const friend = await Customer.findById(refereeId).select("name");
    const first = friend?.name?.trim().split(/\s+/)[0];
    await deliverToCustomers([referrerId], {
      category: "bookingUpdates",
      title: `You earned ${inr(amount)}!`,
      body: `${first ? `${first} just` : "Your friend just"} made their first booking. ${inr(amount)} has been added to your wallet.`,
      data: { screen: "referral" },
    });
  });
}
