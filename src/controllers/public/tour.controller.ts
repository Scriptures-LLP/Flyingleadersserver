import type { Request, Response } from "express";

import { Tour } from "../../models/Tour.js";
import { serializeTourDetail, serializeTourSummary } from "../../services/tourSerializer.service.js";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { category, countryId, search, page, limit } = req.query as unknown as {
    category?: string;
    countryId?: string;
    search?: string;
    page: number;
    limit: number;
  };

  const filter: Record<string, unknown> = { isActive: true };
  if (category) filter.category = category;
  if (countryId) filter.countryId = countryId;
  if (search) filter.title = { $regex: search, $options: "i" };

  const [items, total] = await Promise.all([
    Tour.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Tour.countDocuments(filter),
  ]);

  res.json({ items: items.map(serializeTourSummary), total, page, limit });
});

export const getBySlug = asyncHandler(async (req: Request, res: Response) => {
  const tour = await Tour.findOne({ slug: req.params.slug, isActive: true });
  if (!tour) throw ApiError.notFound("Tour not found");
  res.json({ item: serializeTourDetail(tour) });
});
