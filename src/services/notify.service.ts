import { Booking } from "../models/Booking.js";
import { Customer } from "../models/Customer.js";
import { Setting } from "../models/Setting.js";

import { bookingPdfPublicUrl } from "../utils/bookingPdfLink.js";

import { deliverToCustomers } from "./push.service.js";
import { isWhatsAppConfigured, sendWhatsAppDocumentTemplate, sendWhatsAppTemplate, toGupshupDestination } from "./whatsapp.service.js";

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

/**
 * Sends a WhatsApp template if, and only if, the admin has set a template id
 * for this event in Settings (key "whatsapp_<event>_template_id" — editable
 * from the admin's existing Settings page, same mechanism as terms_html /
 * referral_reward_amount). No template id configured = silently does nothing,
 * so this is safe to call from every notify* function without it doing
 * anything until the client actually has an approved Gupshup template.
 *
 * `params` must already be in the exact order the template's {{1}}, {{2}}…
 * placeholders expect — that order is defined by whichever template gets
 * configured, so it has to be matched by hand per event once a real template
 * id is set.
 */
async function notifyWhatsApp(event: string, phone: string | undefined, params: string[]) {
  if (!phone || !isWhatsAppConfigured()) return;
  const destination = toGupshupDestination(phone);
  if (!destination) return;
  const setting = await Setting.findOne({ key: `whatsapp_${event}_template_id` });
  const templateId = setting?.value?.trim();
  if (!templateId) return;
  await sendWhatsAppTemplate(destination, templateId, params);
}

/**
 * Same idea as notifyWhatsApp, but for a template with a document header (the
 * trip-summary PDF) — setting key "whatsapp_<event>_invoice_template_id". No
 * template id configured, or PUBLIC_API_BASE_URL unset (so there's no URL to
 * hand WhatsApp), both silently no-op, same as notifyWhatsApp.
 */
async function notifyWhatsAppDocument(event: string, phone: string | undefined, bookingId: string, bodyParams: string[]) {
  if (!phone || !isWhatsAppConfigured()) return;
  const destination = toGupshupDestination(phone);
  if (!destination) return;
  const setting = await Setting.findOne({ key: `whatsapp_${event}_invoice_template_id` });
  const templateId = setting?.value?.trim();
  if (!templateId) return;
  const documentUrl = bookingPdfPublicUrl(bookingId);
  if (!documentUrl) return;
  await sendWhatsAppDocumentTemplate(destination, templateId, documentUrl, bodyParams);
}

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
    // Params (once "whatsapp_payment_template_id" is set in admin Settings):
    // {{1}} customer name, {{2}} tour, {{3}} amount paid, {{4}} booking ref.
    await notifyWhatsApp("payment", b.contactPhone, [b.contactName, tourTitle(b), inr(amount), b.bookingRef]);
    // Separately configured (once "whatsapp_payment_invoice_template_id" is set):
    // the trip-summary PDF as a document, body params {{1}} customer name, {{2}} tour.
    await notifyWhatsAppDocument("payment", b.contactPhone, String(b._id), [b.contactName, tourTitle(b)]);
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
