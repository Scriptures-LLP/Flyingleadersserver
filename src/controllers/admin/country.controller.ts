import type { Request, Response } from "express";

import { Country } from "../../models/Country.js";
import { syncCountryRemove, syncCountryUpsert } from "../../mysql/sync/countrySync.js";
import { runMysqlSync } from "../../mysql/syncStatus.js";
import { attachUploadedImage } from "../../services/imageUpload.service.js";
import { s3Adapter } from "../../storage/s3Adapter.js";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const countryController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    const items = await Country.find().sort({ sortOrder: 1, name: 1 });
    res.json({ items });
  }),

  get: asyncHandler(async (req: Request, res: Response) => {
    const item = await Country.findById(req.params.id);
    if (!item) throw ApiError.notFound("Country not found");
    res.json({ item });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const updates: Record<string, unknown> = { ...req.body };
    await attachUploadedImage(req, "countries", updates, "coverImage");
    const item = await Country.create(updates);
    await runMysqlSync(Country, item, () => syncCountryUpsert(item));
    res.status(201).json({ item });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const existing = await Country.findById(req.params.id);
    if (!existing) throw ApiError.notFound("Country not found");

    const updates: Record<string, unknown> = { ...req.body };
    await attachUploadedImage(req, "countries", updates, "coverImage", existing.coverImage as string | undefined);

    Object.assign(existing, updates);
    await existing.save();
    await runMysqlSync(Country, existing, () => syncCountryUpsert(existing));
    res.json({ item: existing });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const item = await Country.findByIdAndDelete(req.params.id);
    if (!item) throw ApiError.notFound("Country not found");
    if (item.coverImage) await s3Adapter.remove(item.coverImage as string).catch(() => undefined);
    await syncCountryRemove(item.legacyMysqlId as number | undefined).catch((err) =>
      console.error("[mysql-sync] failed to remove country:", err),
    );
    res.status(204).send();
  }),

  resync: asyncHandler(async (req: Request, res: Response) => {
    const item = await Country.findById(req.params.id);
    if (!item) throw ApiError.notFound("Country not found");
    await runMysqlSync(Country, item, () => syncCountryUpsert(item));
    const refreshed = await Country.findById(item._id);
    res.json({ item: refreshed });
  }),
};
