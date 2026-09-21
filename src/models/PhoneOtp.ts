import { Schema, model } from "mongoose";

// One row per mobile number that has asked for a code. Holds only a keyed hash
// of the code (never the code), the wrong-guess count, and the bookkeeping for
// the resend cooldown / hourly cap.
const phoneOtpSchema = new Schema(
  {
    phone: { type: String, required: true, unique: true }, // canonical +91XXXXXXXXXX
    purpose: { type: String, enum: ["login", "reset"], required: true },
    codeHash: { type: String, required: true },
    codeExpiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    lastSentAt: { type: Date, required: true },
    windowStart: { type: Date, required: true },
    sendCount: { type: Number, default: 1 },
    // TTL: the row (and its counters) disappears an hour after the window opened.
    expireAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true },
);

export const PhoneOtp = model("PhoneOtp", phoneOtpSchema);

// SMS sent per day across all customers — the ceiling that stops OTP requests
// being used to run up the SMS bill.
const smsUsageSchema = new Schema({
  day: { type: String, required: true, unique: true }, // YYYY-MM-DD (UTC)
  count: { type: Number, default: 0 },
  expireAt: { type: Date, required: true, index: { expires: 0 } },
});

export const SmsUsage = model("SmsUsage", smsUsageSchema);
