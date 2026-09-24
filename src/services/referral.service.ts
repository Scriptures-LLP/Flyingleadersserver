import crypto from "node:crypto";

import { CreditWallet, Referral, ReferralCode, WalletTransaction } from "../models/Referral.js";
import { Setting } from "../models/Setting.js";
import { ApiError } from "../utils/ApiError.js";

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
 *
 * The referral is claimed atomically (pending → rewarded in one step) before
 * any money moves, so two payments landing at the same instant can't both
 * credit the referrer.
 */
export async function rewardReferralIfQualifying(refereeCustomerId: string, bookingId: string): Promise<void> {
  const rewardAmount = await getReferralRewardAmount();
  const referral = await Referral.findOneAndUpdate(
    { refereeCustomerId, status: "pending" },
    { $set: { status: "rewarded", qualifyingBookingId: bookingId, rewardAmount } },
    { new: true },
  );
  if (!referral) return;

  try {
    await creditWallet(String(referral.referrerCustomerId), rewardAmount, {
      type: "referral_reward",
      relatedReferralId: referral._id,
      relatedBookingId: bookingId as any,
      note: "Referral reward",
    } as any);
  } catch (err) {
    // The reward wasn't paid out — put the referral back so a later payment can still earn it.
    await Referral.updateOne(
      { _id: referral._id },
      { $set: { status: "pending" }, $unset: { qualifyingBookingId: 1, rewardAmount: 1 } },
    );
    throw err;
  }

  const { notifyReferralReward } = await import("./notify.service.js");
  void notifyReferralReward(String(referral.referrerCustomerId), rewardAmount, String(referral.refereeCustomerId));
}

export async function getWalletBalance(customerId: string): Promise<number> {
  const wallet = await CreditWallet.findOne({ customerId });
  return wallet?.balance ?? 0;
}

/**
 * Whether the credit applied to a booking that hasn't been paid yet is still
 * there. Credit is only spent when the booking's first payment lands (not when
 * the booking is created — otherwise backing out of checkout would burn it), so
 * before money moves we check the customer hasn't spent it elsewhere meanwhile.
 */
export async function assertWalletCreditAvailable(booking: {
  customerId: unknown;
  amountPaid: number;
  pricing: { walletCreditApplied?: number | null };
}): Promise<void> {
  const applied = booking.pricing.walletCreditApplied ?? 0;
  if (applied <= 0 || booking.amountPaid > 0) return;
  if ((await getWalletBalance(String(booking.customerId))) < applied) {
    throw ApiError.badRequest(
      "The wallet credit applied to this booking is no longer available (it was used on another booking). Please make a new booking.",
    );
  }
}

/**
 * Spends up to `amount` of the customer's wallet credit on a booking, when its
 * first payment lands. Returns the amount actually taken. The balance is
 * decremented with a condition, so it can never go negative and two bookings
 * can never spend the same credit.
 */
export async function redeemWalletCredit(customerId: string, amount: number, bookingId: string): Promise<number> {
  if (amount <= 0) return 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const wallet = await CreditWallet.findOne({ customerId });
    const take = Math.min(wallet?.balance ?? 0, amount);
    if (take <= 0) return 0;
    const updated = await CreditWallet.findOneAndUpdate({ customerId, balance: { $gte: take } }, { $inc: { balance: -take } });
    if (!updated) continue; // the balance changed under us — re-read and try again
    await WalletTransaction.create({
      customerId,
      amount: -take,
      type: "redemption",
      relatedBookingId: bookingId as any,
      note: "Applied to booking",
    });
    return take;
  }
  return 0;
}

/** Gives back credit that a booking had used, when that booking is fully refunded. */
export async function restoreWalletCredit(customerId: string, amount: number, bookingId: string): Promise<void> {
  if (amount <= 0) return;
  await creditWallet(customerId, amount, {
    type: "redemption_reversal",
    relatedBookingId: bookingId as any,
    note: "Booking refunded — credit returned",
  } as any);
}

export async function adminAdjustWallet(customerId: string, amount: number, note?: string): Promise<void> {
  await creditWallet(customerId, amount, { type: "admin_adjustment", note } as any);
}
