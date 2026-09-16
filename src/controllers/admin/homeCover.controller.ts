import type { Request, Response } from "express";

import { HomeCover } from "../../models/HomeCover.js";
import { syncHomeCoverRemove, syncHomeCoverUpsert } from "../../mysql/sync/homeCoverSync.js";
import { runMysqlSync } from "../../mysql/syncStatus.js";
import { attachUploadedImage } from "../../services/imageUpload.service.js";
import { s3Adapter } from "../../storage/s3Adapter.js";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const homeCoverController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    const items = await HomeCover.find().sort({ sortOrder: 1, createdAt: -1 });
    res.json({ items });
  }),

  get: asyncHandler(async (req: Request, res: Response) => {
    const item = await HomeCover.findById(req.params.id);
    if (!item) throw ApiError.notFound("Home cover not found");
    res.json({ item });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const updates: Record<string, unknown> = { ...req.body };
    await attachUploadedImage(req, "covers", updates, "image");
    if (!updates.image) throw ApiError.badRequest("An image file is required");
    const item = await HomeCover.create(updates);
    await runMysqlSync(HomeCover, item, () => syncHomeCoverUpsert(item));
    res.status(201).json({ item });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const existing = await HomeCover.findById(req.params.id);
    if (!existing) throw ApiError.notFound("Home cover not found");

    const updates: Record<string, unknown> = { ...req.body };
    await attachUploadedImage(req, "covers", updates, "image", existing.image as string | undefined);

    Object.assign(existing, updates);
    await existing.save();
    await runMysqlSync(HomeCover, existing, () => syncHomeCoverUpsert(existing));
    res.json({ item: existing });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const item = await HomeCover.findByIdAndDelete(req.params.id);
    if (!item) throw ApiError.notFound("Home cover not found");
    if (item.image) await s3Adapter.remove(item.image as string).catch(() => undefined);
    await syncHomeCoverRemove(item.legacyMysqlId as number | undefined).catch((err) =>
      console.error("[mysql-sync] failed to remove home cover:", err),
    );
    res.status(204).send();
  }),

  resync: asyncHandler(async (req: Request, res: Response) => {
    const item = await HomeCover.findById(req.params.id);
    if (!item) throw ApiError.notFound("Home cover not found");
    await runMysqlSync(HomeCover, item, () => syncHomeCoverUpsert(item));
    const refreshed = await HomeCover.findById(item._id);
    res.json({ item: refreshed });
  }),
};
