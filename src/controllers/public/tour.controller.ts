import type { Request, Response } from "express";

import { Tour } from "../../models/Tour.js";
import { TourDate } from "../../models/TourDate.js";
import { TourMedia } from "../../models/TourMedia.js";
import { serializeTourDetail, serializeTourSummary } from "../../services/tourSerializer.service.js";
import { s3Adapter } from "../../storage/s3Adapter.js";
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
  if (countryId) filter.countryId = countryId;
  // Category and search each need an $or, so collect them under a single $and to
  // avoid one clobbering the other.
  const and: Record<string, unknown>[] = [];
  // A tour can be tagged under two categories, so a category filter matches
  // either slot (its primary `category` or secondary `category2`).
  if (category) and.push({ $or: [{ category }, { category2: category }] });
  // Search matches the tour title OR its destination (location).
  if (search) {
    const rx = { $regex: search, $options: "i" };
    and.push({ $or: [{ title: rx }, { location: rx }] });
  }
  if (and.length > 0) filter.$and = and;

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

  // Package gallery — the "primary first, then manual sort order" arrangement
  // the content team set in the admin panel.
  const media = await TourMedia.find({ tourId: tour._id }).sort({
    isPrimary: -1,
    sortOrder: 1,
    createdAt: 1,
  });
  const galleryUrls = media.map((m) => s3Adapter.urlFor(m.file as string));

  res.json({ item: serializeTourDetail(tour, galleryUrls) });
});

export const listDates = asyncHandler(async (req: Request, res: Response) => {
  const tour = await Tour.findOne({ slug: req.params.slug, isActive: true });
  if (!tour) throw ApiError.notFound("Tour not found");

  const dates = await TourDate.find({ tourId: tour._id, isActive: true, date: { $gte: new Date() } })
    .populate("airportId", "code name")
    .sort({ date: 1 });

  res.json({
    items: dates.map((d) => ({
      id: d.id,
      date: d.date,
      price: d.price,
      label: d.label ?? null,
      airport: d.airportId && typeof d.airportId === "object" ? d.airportId : null,
    })),
  });
});
