import { Schema, model } from "mongoose";

// One row per email address that has asked for a password-reset code. Holds
// only a keyed hash of the code (never the code itself), how many wrong guesses
// it has taken, and the bookkeeping for the resend cooldown / hourly cap.
const passwordResetSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    codeHash: { type: String, required: true },
    codeExpiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    lastSentAt: { type: Date, required: true },
    // Start of the current hourly window and how many codes were sent in it.
    windowStart: { type: Date, required: true },
    sendCount: { type: Number, default: 1 },
    // TTL: the row (and its counters) disappears an hour after the window opened.
    expireAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true },
);

export const PasswordReset = model("PasswordReset", passwordResetSchema);
