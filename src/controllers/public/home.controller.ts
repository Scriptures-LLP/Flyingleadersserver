import type { Request, Response } from "express";

import { Category } from "../../models/Category.js";
import { Country } from "../../models/Country.js";
import { HomeCover } from "../../models/HomeCover.js";
import { Tour } from "../../models/Tour.js";
import { s3Adapter } from "../../storage/s3Adapter.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { serializeTourSummary } from "../../services/tourSerializer.service.js";
import { serializeCategory } from "./category.controller.js";
import { serializeCountry } from "./country.controller.js";

const FEATURED_LIMIT = 10;
const TOP_COUNTRIES_LIMIT = 8;

export const getHome = asyncHandler(async (_req: Request, res: Response) => {
  const [categories, countries, featuredTours, homeCovers] = await Promise.all([
    Category.find({ isActive: true }).sort({ sortOrder: 1, label: 1 }),
    Country.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).limit(TOP_COUNTRIES_LIMIT),
    Tour.find({ isActive: true }).sort({ createdAt: -1 }).limit(FEATURED_LIMIT),
    HomeCover.find({ isActive: true }).sort({ sortOrder: 1, createdAt: -1 }),
  ]);

  res.json({
    categories: categories.map(serializeCategory),
    topCountries: countries.map(serializeCountry),
    featuredTours: featuredTours.map(serializeTourSummary),
    homeCovers: homeCovers.map((c) => ({
      id: c.id,
      title: c.title ?? "",
      image: s3Adapter.urlFor(c.image as string),
    })),
  });
});
