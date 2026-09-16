import type { Request, Response } from "express";

import { Review } from "../../models/Review.js";
import { recomputeTourRating } from "../../services/reviewAggregate.service.js";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const filter = req.query.status ? { status: req.query.status } : {};
  const reviews = await Review.find(filter)
    .populate("tourId", "title slug")
    .populate("customerId", "name email")
    .sort({ createdAt: -1 });
  res.json({ items: reviews });
});

export const moderate = asyncHandler(async (req: Request, res: Response) => {
  const { status, moderationNote } = req.body as { status: "approved" | "rejected"; moderationNote?: string };

  const review = await Review.findByIdAndUpdate(
    req.params.id,
    { status, moderationNote, moderatedBy: req.admin!.sub, moderatedAt: new Date() },
    { new: true },
  );
  if (!review) throw ApiError.notFound("Review not found");

  await recomputeTourRating(String(review.tourId));

  res.json({ item: review });
});
