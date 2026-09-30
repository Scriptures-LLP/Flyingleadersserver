import crypto from "node:crypto";

import Razorpay from "razorpay";

import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

let client: Razorpay | null = null;

function getClient(): Razorpay {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw ApiError.badRequest("Payments are not configured on this server yet");
  }
  if (!client) {
    client = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  }
  return client;
}

const toPaise = (rupees: number) => Math.round(rupees * 100);

/**
 * The Razorpay SDK rejects with a plain object like
 * `{ statusCode, error: { description, reason, ... } }` — not an Error — so an
 * expected failure (e.g. refunding a payment that isn't in this Razorpay
 * account: "The id provided does not exist") otherwise bubbles up as a generic
 * 500 "Internal server error". Translate it into an ApiError carrying
 * Razorpay's own description so the admin sees what actually went wrong. A 4xx
 * from Razorpay stays a 4xx (client/business problem); anything else is a
 * gateway failure (502).
 */
function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  const rzp = err as { statusCode?: number; error?: { description?: string } };
  const description = rzp?.error?.description;
  if (description) {
    const status =
      rzp.statusCode && rzp.statusCode >= 400 && rzp.statusCode < 500 ? rzp.statusCode : 502;
    return new ApiError(status, `Razorpay: ${description}`);
  }
  return new ApiError(502, "Razorpay request failed. Please try again.");
}

async function callRazorpay<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw toApiError(err);
  }
}

export async function createOrder(amountRupees: number, receipt: string, notes?: Record<string, string>) {
  return callRazorpay(() =>
    getClient().orders.create({
      amount: toPaise(amountRupees),
      currency: "INR",
      receipt,
      notes,
    }),
  );
}

function safeEqual(expectedHex: string, actualHex: string): boolean {
  const expected = Buffer.from(expectedHex);
  const actual = Buffer.from(actualHex || "");
  // timingSafeEqual throws on length mismatch rather than returning false.
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

/** Matches flyingdotcom's own check: hmac_sha256(order_id|payment_id, key_secret) === signature. */
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  const expected = crypto
    .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return safeEqual(expected, signature);
}

export function verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
  if (!env.RAZORPAY_WEBHOOK_SECRET) return false;
  const expected = crypto.createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
}

export async function fetchPayment(paymentId: string) {
  return callRazorpay(() => getClient().payments.fetch(paymentId));
}

/** The payment attempts made against an order (read-only) — used to reconcile a payment whose result never reached us. */
export async function fetchOrderPayments(orderId: string) {
  return callRazorpay(() => getClient().orders.fetchPayments(orderId));
}

export async function createRefund(paymentId: string, amountRupees?: number) {
  return callRazorpay(() =>
    getClient().payments.refund(paymentId, amountRupees ? { amount: toPaise(amountRupees) } : {}),
  );
}
