import crypto from "node:crypto";

import { env } from "../config/env.js";
import { Customer } from "../models/Customer.js";
import { PasswordReset } from "../models/PasswordReset.js";
import { ApiError } from "../utils/ApiError.js";

import { isMailConfigured, passwordResetEmail, sendMail } from "./mailer.service.js";

export const CODE_TTL_MINUTES = 10;
const RESEND_COOLDOWN_MS = 60_000;
const MAX_SENDS_PER_HOUR = 5;
const HOUR_MS = 60 * 60_000;
// Wrong guesses allowed per code. With a 6-digit code (a million values) five
// tries is a 1-in-200,000 shot, and each new code resets nothing an attacker
// can use: requests are capped at MAX_SENDS_PER_HOUR.
const MAX_ATTEMPTS = 5;

// Keyed hash so the stored value is useless without the server's secret, and
// bound to the email so a code can't be replayed against another address.
const hashCode = (email: string, code: string) =>
  crypto.createHmac("sha256", env.JWT_SECRET).update(`password-reset:${email}:${code}`).digest("hex");

/**
 * Emails a reset code to the account with this address.
 *
 * Deliberately says nothing about whether the address has an account: an
 * unknown address, a resend inside the cooldown and an hourly-cap hit all
 * return quietly, exactly like a real send. (Only "email isn't set up" and "the
 * mail server failed" are reported, and neither depends on the address.)
 */
export async function requestPasswordResetCode(rawEmail: string): Promise<void> {
  if (!isMailConfigured()) throw ApiError.serviceUnavailable("Email isn't set up on this server yet");

  const email = rawEmail.trim().toLowerCase();
  const customer = await Customer.findOne({ email });
  if (!customer || !customer.isActive) return;

  const now = new Date();
  const existing = await PasswordReset.findOne({ email });
  const inWindow = !!existing && now.getTime() < existing.windowStart.getTime() + HOUR_MS;
  if (existing) {
    if (now.getTime() - existing.lastSentAt.getTime() < RESEND_COOLDOWN_MS) return;
    if (inWindow && existing.sendCount >= MAX_SENDS_PER_HOUR) return;
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const windowStart = inWindow ? existing!.windowStart : now;
  await PasswordReset.findOneAndUpdate(
    { email },
    {
      $set: {
        customerId: customer._id,
        codeHash: hashCode(email, code),
        codeExpiresAt: new Date(now.getTime() + CODE_TTL_MINUTES * 60_000),
        attempts: 0,
        lastSentAt: now,
        windowStart,
        sendCount: inWindow ? existing!.sendCount + 1 : 1,
        expireAt: new Date(windowStart.getTime() + HOUR_MS),
      },
    },
    { upsert: true },
  );

  try {
    await sendMail({ to: email, ...passwordResetEmail(code, CODE_TTL_MINUTES) });
  } catch (err) {
    // Never log the code. Drop the row so this failed send doesn't burn the
    // customer's cooldown and they can simply try again.
    await PasswordReset.deleteOne({ email });
    console.error("[password-reset] email send failed:", err instanceof Error ? err.message : err);
    throw ApiError.serviceUnavailable("Couldn't send the email right now. Please try again in a moment.");
  }
}

/**
 * Checks a code and, if it's right, uses it up. Returns the customer it
 * belongs to. The delete is atomic, so two requests racing with the same code
 * can't both succeed.
 */
export async function consumePasswordResetCode(rawEmail: string, code: string) {
  const email = rawEmail.trim().toLowerCase();
  const invalid = () => ApiError.badRequest("That code is invalid or has expired. Request a new one.");

  const used = await PasswordReset.findOneAndDelete({
    email,
    codeHash: hashCode(email, code),
    codeExpiresAt: { $gt: new Date() },
    attempts: { $lt: MAX_ATTEMPTS },
  });
  if (used) return used.customerId;

  // Wrong / expired / already used: count it against this code. Once it has
  // taken MAX_ATTEMPTS wrong guesses it's dead, however correct a later guess is.
  await PasswordReset.updateOne({ email }, { $inc: { attempts: 1 } });
  throw invalid();
}
