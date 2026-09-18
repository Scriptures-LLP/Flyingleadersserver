import type { Request, Response } from "express";

import { Category } from "../../models/Category.js";
import { withImageUrl } from "../../services/adminSerialize.js";
import { attachUploadedImage } from "../../services/imageUpload.service.js";
import { s3Adapter } from "../../storage/s3Adapter.js";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const serialize = (doc: any) => withImageUrl(doc, "image", "imageUrl");

export const categoryController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    const items = await Category.find().sort({ sortOrder: 1, label: 1 });
    res.json({ items: items.map(serialize) });
  }),

  get: asyncHandler(async (req: Request, res: Response) => {
    const item = await Category.findById(req.params.id);
    if (!item) throw ApiError.notFound("Category not found");
    res.json({ item: serialize(item) });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const updates: Record<string, unknown> = { ...req.body };
    await attachUploadedImage(req, "categories", updates, "image");
    const item = await Category.create(updates);
    res.status(201).json({ item: serialize(item) });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const existing = await Category.findById(req.params.id);
    if (!existing) throw ApiError.notFound("Category not found");

    const updates: Record<string, unknown> = { ...req.body };
    await attachUploadedImage(req, "categories", updates, "image", existing.image as string | undefined);

    Object.assign(existing, updates);
    await existing.save();
    res.json({ item: serialize(existing) });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const item = await Category.findByIdAndDelete(req.params.id);
    if (!item) throw ApiError.notFound("Category not found");
    if (item.image) await s3Adapter.remove(item.image as string).catch(() => undefined);
    res.status(204).send();
  }),
};
