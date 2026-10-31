import crypto from "node:crypto";

import { env } from "../config/env.js";

/**
 * Authorises the token-based trip-summary PDF route (booking.controller.ts'
 * tripSummaryPdfByToken) for one booking — an HMAC over the booking id, so it
 * can be recomputed on each request (never stored) and can't be forged or
 * guessed without JWT_SECRET.
 */
export function bookingPdfToken(bookingId: string): string {
  return crypto.createHmac("sha256", env.JWT_SECRET).update(bookingId).digest("hex").slice(0, 32);
}

/**
 * The full public URL an outside service (WhatsApp, via Gupshup) can fetch the
 * trip-summary PDF from — no login, since it can't carry a customer's Bearer
 * token. Null when PUBLIC_API_BASE_URL isn't set, so a caller can skip the
 * send entirely rather than send a broken link.
 */
export function bookingPdfPublicUrl(bookingId: string): string | null {
  if (!env.PUBLIC_API_BASE_URL) return null;
  return `${env.PUBLIC_API_BASE_URL.replace(/\/$/, "")}/booking-docs/${bookingId}/trip-summary.pdf?token=${bookingPdfToken(bookingId)}`;
}
