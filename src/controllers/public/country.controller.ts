import type { Request, Response } from "express";

import { Country } from "../../models/Country.js";
import { localDiskAdapter } from "../../storage/localDiskAdapter.js";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { placeholderImage } from "../../utils/placeholderImage.js";

export function serializeCountry(country: any) {
  return {
    id: country.id,
    slug: country.slug,
    name: country.name,
    title: country.name,
    location: country.name,
    image: country.coverImage ? localDiskAdapter.urlFor(country.coverImage) : placeholderImage(country.slug, 400, 500),
  };
}

export const list = asyncHandler(async (_req: Request, res: Response) => {
  const items = await Country.find({ isActive: true }).sort({ sortOrder: 1, name: 1 });
  res.json({ items: items.map(serializeCountry) });
});

export const getBySlug = asyncHandler(async (req: Request, res: Response) => {
  const country = await Country.findOne({ slug: req.params.slug, isActive: true });
  if (!country) throw ApiError.notFound("Country not found");
  res.json({ item: serializeCountry(country) });
});
