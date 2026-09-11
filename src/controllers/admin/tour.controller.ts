import type { Request, Response } from "express";

import { Tour } from "../../models/Tour.js";
import { syncTourRemove, syncTourUpsert } from "../../mysql/sync/tourSync.js";
import { runMysqlSync } from "../../mysql/syncStatus.js";
import { attachUploadedImage } from "../../services/imageUpload.service.js";
import { localDiskAdapter } from "../../storage/localDiskAdapter.js";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const items = await Tour.find().sort({ createdAt: -1 });
  res.json({ items });
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  const tour = await Tour.findById(req.params.id);
  if (!tour) throw ApiError.notFound("Tour not found");
  res.json({ item: tour });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const updates: Record<string, unknown> = { ...req.body };
  await attachUploadedImage(req, "tours", updates, "coverImage");
  const tour = await Tour.create(updates);
  await runMysqlSync(Tour, tour, () => syncTourUpsert(tour));
  res.status(201).json({ item: tour });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const existing = await Tour.findById(req.params.id);
  if (!existing) throw ApiError.notFound("Tour not found");

  const updates: Record<string, unknown> = { ...req.body };
  await attachUploadedImage(req, "tours", updates, "coverImage", existing.coverImage as string | undefined);

  Object.assign(existing, updates);
  await existing.save();
  await runMysqlSync(Tour, existing, () => syncTourUpsert(existing));
  res.json({ item: existing });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const tour = await Tour.findByIdAndDelete(req.params.id);
  if (!tour) throw ApiError.notFound("Tour not found");
  if (tour.coverImage) await localDiskAdapter.remove(tour.coverImage as string).catch(() => undefined);
  await syncTourRemove(tour.legacyMysqlId as number | undefined).catch((err) =>
    console.error("[mysql-sync] failed to remove tour:", err),
  );
  res.status(204).send();
});

export const resync = asyncHandler(async (req: Request, res: Response) => {
  const tour = await Tour.findById(req.params.id);
  if (!tour) throw ApiError.notFound("Tour not found");
  await runMysqlSync(Tour, tour, () => syncTourUpsert(tour));
  const refreshed = await Tour.findById(tour._id);
  res.json({ item: refreshed });
});
