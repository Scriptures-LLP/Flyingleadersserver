import type { Request, Response } from "express";

import { GalleryImage } from "../../models/GalleryImage.js";
import { syncGalleryImageRemove, syncGalleryImageUpsert } from "../../mysql/sync/galleryImageSync.js";
import { runMysqlSync } from "../../mysql/syncStatus.js";
import { withImageUrl } from "../../services/adminSerialize.js";
import { attachUploadedImage } from "../../services/imageUpload.service.js";
import { s3Adapter } from "../../storage/s3Adapter.js";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const serialize = (doc: any) => withImageUrl(doc, "file", "url");

export const galleryImageController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    const items = await GalleryImage.find().sort({ sortOrder: 1, createdAt: -1 });
    res.json({ items: items.map(serialize) });
  }),

  get: asyncHandler(async (req: Request, res: Response) => {
    const item = await GalleryImage.findById(req.params.id);
    if (!item) throw ApiError.notFound("Gallery image not found");
    res.json({ item: serialize(item) });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const updates: Record<string, unknown> = { ...req.body };
    await attachUploadedImage(req, "gallery", updates, "file");
    if (!updates.file) throw ApiError.badRequest("An image file is required");
    const item = await GalleryImage.create(updates);
    await runMysqlSync(GalleryImage, item, () => syncGalleryImageUpsert(item));
    res.status(201).json({ item: serialize(item) });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const existing = await GalleryImage.findById(req.params.id);
    if (!existing) throw ApiError.notFound("Gallery image not found");

    const updates: Record<string, unknown> = { ...req.body };
    await attachUploadedImage(req, "gallery", updates, "file", existing.file as string | undefined);

    Object.assign(existing, updates);
    await existing.save();
    await runMysqlSync(GalleryImage, existing, () => syncGalleryImageUpsert(existing));
    res.json({ item: serialize(existing) });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const item = await GalleryImage.findByIdAndDelete(req.params.id);
    if (!item) throw ApiError.notFound("Gallery image not found");
    if (item.file) await s3Adapter.remove(item.file as string).catch(() => undefined);
    await syncGalleryImageRemove(item.legacyMysqlId as number | undefined).catch((err) =>
      console.error("[mysql-sync] failed to remove gallery image:", err),
    );
    res.status(204).send();
  }),

  resync: asyncHandler(async (req: Request, res: Response) => {
    const item = await GalleryImage.findById(req.params.id);
    if (!item) throw ApiError.notFound("Gallery image not found");
    await runMysqlSync(GalleryImage, item, () => syncGalleryImageUpsert(item));
    const refreshed = await GalleryImage.findById(item._id);
    res.json({ item: refreshed ? serialize(refreshed) : null });
  }),
};
