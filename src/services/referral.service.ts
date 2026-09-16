import crypto from "node:crypto";

import { CreditWallet, Referral, ReferralCode, WalletTransaction } from "../models/Referral.js";
import { Setting } from "../models/Setting.js";

const DEFAULT_REFERRAL_REWARD = 500;

async function getReferralRewardAmount(): Promise<number> {
  const setting = await Setting.findOne({ key: "referral_reward_amount" });
  const parsed = setting ? Number(setting.value) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_REFERRAL_REWARD;
}

function generateCode(name: string): string {
  const base = name.trim().split(/\s+/)[0]?.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6) || "FLYER";
  return `${base}${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}

export async function getOrCreateReferralCode(customerId: string, customerName: string): Promise<string> {
  const existing = await ReferralCode.findOne({ customerId });
  if (existing) return existing.code;

  // Extremely unlikely to collide, but retry a couple of times rather than
  // trust randomness blindly against the unique index.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const doc = await ReferralCode.create({ customerId, code: generateCode(customerName) });
      return doc.code;
    } catch (err: any) {
      if (err?.code !== 11000) throw err;
    }
  }
  throw new Error("Could not generate a unique referral code");
}

/** Called at signup — links a new customer to whoever referred them, if a valid code was given. */
export async function captureReferralSignup(referralCode: string, refereeCustomerId: string): Promise<void> {
  const code = referralCode.trim().toUpperCase();
  const owner = await ReferralCode.findOne({ code });
  if (!owner) return; // Invalid/unknown code — silently ignored, not worth blocking signup over.
  if (String(owner.customerId) === refereeCustomerId) return; // Can't refer yourself.

  await Referral.create({
    referrerCustomerId: owner.customerId,
    refereeCustomerId,
    referralCode: code,
    status: "pending",
  }).catch((err: any) => {
    if (err?.code !== 11000) throw err; // Already has a referral record — ignore.
  });
}

async function creditWallet(customerId: string, amount: number, entry: Omit<Parameters<typeof WalletTransaction.create>[0], "customerId" | "amount">) {
  await WalletTransaction.create({ customerId, amount, ...entry });
  await CreditWallet.findOneAndUpdate(
    { customerId },
    { $inc: { balance: amount }, $setOnInsert: { customerId } },
    { upsert: true },
  );
}

/**
 * Called after a booking's first successful payment. Rewards the referrer
 * once per referee — "qualifying" and "rewarding" happen together (the
 * referee's first real payment is the bar, there's no separate later step).
 */
export async function rewardReferralIfQualifying(refereeCustomerId: string, bookingId: string): Promise<void> {
  const referral = await Referral.findOne({ refereeCustomerId, status: "pending" });
  if (!referral) return;

  const rewardAmount = await getReferralRewardAmount();
  referral.status = "rewarded";
  referral.qualifyingBookingId = bookingId as any;
  referral.rewardAmount = rewardAmount;
  await referral.save();

  await creditWallet(String(referral.referrerCustomerId), rewardAmount, {
    type: "referral_reward",
    relatedReferralId: referral._id,
    relatedBookingId: bookingId as any,
    note: "Referral reward",
  } as any);
}

export async function getWalletBalance(customerId: string): Promise<number> {
  const wallet = await CreditWallet.findOne({ customerId });
  return wallet?.balance ?? 0;
}

/** Spends up to `amount` of the customer's wallet credit on a booking. Returns the amount actually applied. */
export async function redeemWalletCredit(customerId: string, amount: number, bookingId: string): Promise<number> {
  if (amount <= 0) return 0;
  const wallet = await CreditWallet.findOne({ customerId });
  const applied = Math.min(wallet?.balance ?? 0, amount);
  if (applied <= 0) return 0;

  await creditWallet(customerId, -applied, {
    type: "redemption",
    relatedBookingId: bookingId as any,
    note: "Applied to booking",
  } as any);
  return applied;
}

export async function adminAdjustWallet(customerId: string, amount: number, note?: string): Promise<void> {
  await creditWallet(customerId, amount, { type: "admin_adjustment", note } as any);
}
