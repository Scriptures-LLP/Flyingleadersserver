import type { Request, Response } from "express";

import { Category } from "../../models/Category.js";
import { s3Adapter } from "../../storage/s3Adapter.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { placeholderImage } from "../../utils/placeholderImage.js";

export function serializeCategory(category: any) {
  return {
    id: category.slug,
    label: category.label,
    image: category.image ? s3Adapter.urlFor(category.image) : placeholderImage(category.slug, 200, 200),
  };
}

export const list = asyncHandler(async (_req: Request, res: Response) => {
  const items = await Category.find({ isActive: true }).sort({ sortOrder: 1, label: 1 });
  res.json({ items: items.map(serializeCategory) });
});
