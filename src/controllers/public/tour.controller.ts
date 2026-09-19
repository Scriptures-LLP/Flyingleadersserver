import type { Request, Response } from "express";

import { Tour } from "../../models/Tour.js";
import { TourDate } from "../../models/TourDate.js";
import { TourMedia } from "../../models/TourMedia.js";
import { listTourAirports } from "../../services/tourOptions.service.js";
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

// Tour Dates — the dates and nothing else. No prices: a date's optional
// add-on is charged (and itemised) at booking time, never blended into what
// this list shows. `airport` is set only when the admin tied the date to one
// airport; null means the date works from any of the tour's airports.
export const listDates = asyncHandler(async (req: Request, res: Response) => {
  const tour = await Tour.findOne({ slug: req.params.slug, isActive: true });
  if (!tour) throw ApiError.notFound("Tour not found");

  const [dates, airports] = await Promise.all([
    TourDate.find({ tourId: tour._id, isActive: true, date: { $gte: new Date() } })
      .sort({ date: 1, sortOrder: 1 })
      .lean(),
    listTourAirports(tour._id),
  ]);
  const airportById = new Map(airports.map((a) => [a.id, a]));

  type DateItem = {
    id: string;
    date: Date;
    label: string | null;
    airport: { _id: string; code: string; name: string } | null;
  };
  const items: DateItem[] = [];
  for (const d of dates) {
    const base = { id: String(d._id), date: d.date, label: d.label ?? null };
    if (!d.airportId) {
      items.push({ ...base, airport: null });
      continue;
    }
    // A date tied to an airport the tour no longer offers (deactivated,
    // switched off, deleted) can't be booked, so it isn't listed — rather
    // than silently turning into an "any airport" date.
    const a = airportById.get(String(d.airportId));
    if (a) items.push({ ...base, airport: { _id: a.id, code: a.code, name: a.name } });
  }

  res.json({ items });
});

// Tour Airport Prices — the departure airports and each one's own add-on
// price, independent of the dates list above.
export const listAirports = asyncHandler(async (req: Request, res: Response) => {
  const tour = await Tour.findOne({ slug: req.params.slug, isActive: true });
  if (!tour) throw ApiError.notFound("Tour not found");

  res.json({ items: await listTourAirports(tour._id) });
});
