import { Schema, model } from "mongoose";

export const referralCodeSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, unique: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  },
  { timestamps: true },
);

export const ReferralCode = model("ReferralCode", referralCodeSchema);

const referralSchema = new Schema(
  {
    referrerCustomerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    refereeCustomerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, unique: true },
    referralCode: { type: String, required: true, uppercase: true, trim: true },
    status: { type: String, enum: ["pending", "qualified", "rewarded"], default: "pending" },
    qualifyingBookingId: { type: Schema.Types.ObjectId, ref: "Booking" },
    rewardAmount: { type: Number, min: 0 },
  },
  { timestamps: true },
);

export const Referral = model("Referral", referralSchema);

const creditWalletSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, unique: true },
    // A cache of the WalletTransaction ledger's sum — the ledger is the real
    // source of truth, this just avoids re-aggregating it on every read.
    balance: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

export const CreditWallet = model("CreditWallet", creditWalletSchema);

const walletTransactionSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    type: { type: String, enum: ["referral_reward", "redemption", "redemption_reversal", "admin_adjustment"], required: true },
    // Positive = credit added, negative = credit spent/removed.
    amount: { type: Number, required: true },
    relatedReferralId: { type: Schema.Types.ObjectId, ref: "Referral" },
    relatedBookingId: { type: Schema.Types.ObjectId, ref: "Booking" },
    note: { type: String, trim: true },
  },
  { timestamps: true },
);

export const WalletTransaction = model("WalletTransaction", walletTransactionSchema);
