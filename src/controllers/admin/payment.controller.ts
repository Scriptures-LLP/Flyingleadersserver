import type { Request, Response } from "express";

import { Transaction } from "../../models/Transaction.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

// Every transaction that actually landed -- online (Razorpay-verified) or
// recorded at the office -- regardless of which booking it's on, newest
// first. Refunds have their own status ("refunded") so they never show up
// here as if they were money coming in.
export const list = asyncHandler(async (_req: Request, res: Response) => {
  const transactions = await Transaction.find({ status: "paid" })
    .populate({
      path: "bookingId",
      select: "bookingRef tourId",
      populate: { path: "tourId", select: "title" },
    })
    .populate("customerId", "name email phone")
    .populate("office.recordedBy", "name")
    .sort({ createdAt: -1 })
    .limit(300);
  res.json({ items: transactions });
});
