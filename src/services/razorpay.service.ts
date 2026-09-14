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

export async function createOrder(amountRupees: number, receipt: string, notes?: Record<string, string>) {
  const order = await getClient().orders.create({
    amount: toPaise(amountRupees),
    currency: "INR",
    receipt,
    notes,
  });
  return order;
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
  return getClient().payments.fetch(paymentId);
}

export async function createRefund(paymentId: string, amountRupees?: number) {
  return getClient().payments.refund(paymentId, amountRupees ? { amount: toPaise(amountRupees) } : {});
}
