import type { Request, Response } from "express";

import { Customer } from "../../models/Customer.js";
import { Referral, WalletTransaction } from "../../models/Referral.js";
import { getOrCreateReferralCode, getWalletBalance } from "../../services/referral.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const getMine = asyncHandler(async (req: Request, res: Response) => {
  const customer = await Customer.findById(req.customer!.sub);
  const code = await getOrCreateReferralCode(req.customer!.sub, customer?.name ?? "Traveler");
  const balance = await getWalletBalance(req.customer!.sub);

  const referrals = await Referral.find({ referrerCustomerId: req.customer!.sub })
    .populate("refereeCustomerId", "name")
    .sort({ createdAt: -1 });

  const ledger = await WalletTransaction.find({ customerId: req.customer!.sub }).sort({ createdAt: -1 }).limit(50);

  res.json({ code, wallet: { balance }, referrals, ledger });
});
