import type { Request, Response } from "express";
import type { HydratedDocument } from "mongoose";

import { Tour } from "../../models/Tour.js";
import { syncTourRemove, syncTourUpsert } from "../../mysql/sync/tourSync.js";
import { runMysqlSync } from "../../mysql/syncStatus.js";
import { attachUploadedImage } from "../../services/imageUpload.service.js";
import { s3Adapter } from "../../storage/s3Adapter.js";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

// Adds the resolved public URL of the cover image so the admin panel can render
// a preview — the stored `coverImage` is only our storage key.
function serializeForAdmin(tour: HydratedDocument<any>) {
  const obj = tour.toObject();
  return { ...obj, coverImageUrl: tour.coverImage ? s3Adapter.urlFor(tour.coverImage as string) : null };
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const items = await Tour.find().sort({ createdAt: -1 });
  res.json({ items: items.map(serializeForAdmin) });
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  const tour = await Tour.findById(req.params.id);
  if (!tour) throw ApiError.notFound("Tour not found");
  res.json({ item: serializeForAdmin(tour) });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const updates: Record<string, unknown> = { ...req.body };
  await attachUploadedImage(req, "tours", updates, "coverImage");
  const tour = await Tour.create(updates);
  await runMysqlSync(Tour, tour, () => syncTourUpsert(tour));
  res.status(201).json({ item: serializeForAdmin(tour) });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const existing = await Tour.findById(req.params.id);
  if (!existing) throw ApiError.notFound("Tour not found");

  const updates: Record<string, unknown> = { ...req.body };
  await attachUploadedImage(req, "tours", updates, "coverImage", existing.coverImage as string | undefined);

  // An explicit empty coverImage (and no replacement file) means "remove the
  // cover" — drop the stored file so it doesn't linger in S3.
  if (!req.file && updates.coverImage === "" && existing.coverImage) {
    await s3Adapter.remove(existing.coverImage as string).catch(() => undefined);
  }

  Object.assign(existing, updates);
  await existing.save();
  await runMysqlSync(Tour, existing, () => syncTourUpsert(existing));
  res.json({ item: serializeForAdmin(existing) });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const tour = await Tour.findByIdAndDelete(req.params.id);
  if (!tour) throw ApiError.notFound("Tour not found");
  if (tour.coverImage) await s3Adapter.remove(tour.coverImage as string).catch(() => undefined);
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
  res.json({ item: refreshed ? serializeForAdmin(refreshed) : null });
});
