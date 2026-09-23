import type { Request, Response } from "express";

import { Category } from "../../models/Category.js";
import { Country } from "../../models/Country.js";
import { GalleryImage } from "../../models/GalleryImage.js";
import { HomeCover } from "../../models/HomeCover.js";
import { Tour } from "../../models/Tour.js";
import { s3Adapter } from "../../storage/s3Adapter.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { serializeTourSummary } from "../../services/tourSerializer.service.js";
import { serializeCategory } from "./category.controller.js";
import { serializeCountry } from "./country.controller.js";

const FEATURED_LIMIT = 10;
const TOP_COUNTRIES_LIMIT = 8;
// AlbumOrbit's decorative collage layout is designed for a 1 hero + 8 orbiting shape.
const GALLERY_LIMIT = 9;

export const getHome = asyncHandler(async (_req: Request, res: Response) => {
  const [categories, countries, featuredTours, homeCovers, galleryImages] = await Promise.all([
    Category.find({ isActive: true }).sort({ sortOrder: 1, label: 1 }),
    Country.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).limit(TOP_COUNTRIES_LIMIT),
    Tour.find({ isActive: true }).sort({ createdAt: -1 }).limit(FEATURED_LIMIT),
    HomeCover.find({ isActive: true }).sort({ sortOrder: 1, createdAt: -1 }),
    GalleryImage.find({ isActive: true }).sort({ sortOrder: 1, createdAt: -1 }).limit(GALLERY_LIMIT),
  ]);

  res.json({
    categories: categories.map(serializeCategory),
    topCountries: countries.map(serializeCountry),
    featuredTours: featuredTours.map(serializeTourSummary),
    homeCovers: homeCovers.map((c) => ({
      id: c.id,
      title: c.title ?? "",
      altText: c.altText ?? "",
      image: s3Adapter.urlFor(c.image as string),
    })),
    galleryImages: galleryImages.map((g) => ({
      id: g.id,
      url: s3Adapter.urlFor(g.file as string),
      title: g.title ?? "",
      altText: g.altText ?? "",
    })),
  });
});
