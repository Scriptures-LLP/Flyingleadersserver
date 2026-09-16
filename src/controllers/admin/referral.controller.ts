import type { Request, Response } from "express";

import { CreditWallet, Referral } from "../../models/Referral.js";
import { adminAdjustWallet } from "../../services/referral.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const listReferrals = asyncHandler(async (req: Request, res: Response) => {
  const referrals = await Referral.find()
    .populate("referrerCustomerId", "name email")
    .populate("refereeCustomerId", "name email")
    .sort({ createdAt: -1 });
  res.json({ items: referrals });
});

export const listWallets = asyncHandler(async (req: Request, res: Response) => {
  const wallets = await CreditWallet.find({ balance: { $gt: 0 } })
    .populate("customerId", "name email")
    .sort({ balance: -1 });
  res.json({ items: wallets });
});

export const adjustWallet = asyncHandler(async (req: Request, res: Response) => {
  const { amount, note } = req.body as { amount: number; note?: string };
  const customerId = req.params.customerId!;
  await adminAdjustWallet(customerId, amount, note);
  const wallet = await CreditWallet.findOne({ customerId });
  res.json({ item: wallet });
});
