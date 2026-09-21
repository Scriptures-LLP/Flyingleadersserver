import crypto from "node:crypto";

import { env } from "../config/env.js";
import { Customer } from "../models/Customer.js";
import { PhoneOtp, SmsUsage } from "../models/PhoneOtp.js";
import { ApiError } from "../utils/ApiError.js";
import { phoneVariants } from "../utils/phone.js";

import { isSmsConfigured, sendOtpSms } from "./sms.service.js";

export type OtpPurpose = "login" | "reset";

export const OTP_TTL_MINUTES = 10;
export const RESEND_COOLDOWN_SECONDS = 30;
const MAX_SENDS_PER_HOUR = 5;
const HOUR_MS = 60 * 60_000;
// Six digits = a million values; five guesses is a 1-in-200,000 shot, and new
// codes are capped at MAX_SENDS_PER_HOUR.
const MAX_ATTEMPTS = 5;

/** A valid Indian mobile: 10 digits starting 6-9, with an optional +91 / 91 / 0 prefix. Returns the 10 digits. */
export function nationalNumber(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  const ten = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.length === 11 && digits.startsWith("0") ? digits.slice(1) : digits;
  return /^[6-9]\d{9}$/.test(ten) ? ten : null;
}

// Fictional numbers that accept a fixed code and never send an SMS ("+911234567890:123456,...").
function testNumbers(): Map<string, string> {
  const map = new Map<string, string>();
  for (const pair of env.OTP_TEST_NUMBERS.split(",")) {
    const [num, code] = pair.split(":").map((x) => x?.trim());
    const digits = (num ?? "").replace(/\D/g, "").slice(-10);
    if (digits.length === 10 && /^\d{6}$/.test(code ?? "")) map.set(digits, code!);
  }
  return map;
}

/** Resolves a typed number to { national, phone }, accepting real Indian mobiles and configured test numbers. */
function resolvePhone(input: string): { national: string; phone: string; testCode?: string } {
  const digits = input.replace(/\D/g, "").slice(-10);
  const testCode = testNumbers().get(digits);
  if (testCode) return { national: digits, phone: `+91${digits}`, testCode };
  const national = nationalNumber(input);
  if (!national) throw ApiError.badRequest("Enter a valid 10-digit mobile number.");
  return { national, phone: `+91${national}` };
}

// Keyed hash so a stored value is useless without the server's secret, and bound
// to the number and purpose so a code can't be replayed elsewhere.
const hashCode = (phone: string, purpose: OtpPurpose, code: string) =>
  crypto.createHmac("sha256", env.JWT_SECRET).update(`phone-otp:${purpose}:${phone}:${code}`).digest("hex");

async function reserveDailySlot() {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const row = await SmsUsage.findOneAndUpdate(
    { day },
    { $inc: { count: 1 }, $setOnInsert: { expireAt: new Date(now.getTime() + 3 * 24 * HOUR_MS) } },
    { upsert: true, new: true },
  );
  if (row.count > env.OTP_DAILY_LIMIT) {
    console.error(`[sms] daily OTP limit (${env.OTP_DAILY_LIMIT}) reached — refusing further sends today`);
    throw ApiError.serviceUnavailable("We can't send more codes right now. Please try again later.");
  }
}

/**
 * Sends a login / password-reset code to a mobile number.
 *
 * For "reset" nothing is sent when the number has no account, and the caller
 * can't tell — that saves the SMS and doesn't confirm who is registered.
 * A resend inside the cooldown or past the hourly cap also returns quietly.
 */
export async function requestPhoneOtp(input: string, purpose: OtpPurpose): Promise<{ resendAfterSeconds: number }> {
  const { national, phone, testCode } = resolvePhone(input);
  const result = { resendAfterSeconds: RESEND_COOLDOWN_SECONDS };
  if (!testCode && !isSmsConfigured()) throw ApiError.serviceUnavailable("SMS isn't set up on this server yet");

  if (purpose === "reset") {
    const exists = await Customer.exists({ phone: { $in: phoneVariants(phone) }, isActive: true });
    if (!exists) return result;
  }

  const now = new Date();
  const existing = await PhoneOtp.findOne({ phone });
  const inWindow = !!existing && now.getTime() < existing.windowStart.getTime() + HOUR_MS;
  if (existing) {
    if (now.getTime() - existing.lastSentAt.getTime() < RESEND_COOLDOWN_SECONDS * 1000) return result;
    if (inWindow && existing.sendCount >= MAX_SENDS_PER_HOUR) return result;
  }

  const code = testCode ?? String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const windowStart = inWindow ? existing!.windowStart : now;
  if (!testCode) await reserveDailySlot();

  await PhoneOtp.findOneAndUpdate(
    { phone },
    {
      $set: {
        purpose,
        codeHash: hashCode(phone, purpose, code),
        codeExpiresAt: new Date(now.getTime() + OTP_TTL_MINUTES * 60_000),
        attempts: 0,
        lastSentAt: now,
        windowStart,
        sendCount: inWindow ? existing!.sendCount + 1 : 1,
        expireAt: new Date(windowStart.getTime() + HOUR_MS),
      },
    },
    { upsert: true },
  );

  if (!testCode) {
    try {
      await sendOtpSms(national, code);
    } catch (err) {
      // Don't leave a code nobody received, and don't burn the customer's cooldown.
      await PhoneOtp.deleteOne({ phone });
      throw err;
    }
  }
  return result;
}

/** Checks a code and, if right, uses it up (atomically, so it works exactly once). Returns the canonical number. */
export async function consumePhoneOtp(input: string, code: string, purpose: OtpPurpose): Promise<string> {
  const { phone } = resolvePhone(input);
  const used = await PhoneOtp.findOneAndDelete({
    phone,
    purpose,
    codeHash: hashCode(phone, purpose, code),
    codeExpiresAt: { $gt: new Date() },
    attempts: { $lt: MAX_ATTEMPTS },
  });
  if (used) return phone;

  await PhoneOtp.updateOne({ phone }, { $inc: { attempts: 1 } });
  throw ApiError.badRequest("That code is invalid or has expired. Request a new one.");
}
