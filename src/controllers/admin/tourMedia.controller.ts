import type { Request, Response } from "express";
import type { HydratedDocument } from "mongoose";

import { TourMedia } from "../../models/TourMedia.js";
import { s3Adapter } from "../../storage/s3Adapter.js";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

// Adds the public URL the admin panel renders thumbnails from — the stored
// `file` is only our storage key.
function serializeForAdmin(item: HydratedDocument<any>) {
  const obj = item.toObject();
  return { ...obj, url: s3Adapter.urlFor(item.file as string) };
}

export const tourMediaController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    if (!req.query.tourId) throw ApiError.badRequest("tourId query param is required");
    const items = await TourMedia.find({ tourId: req.query.tourId }).sort({
      isPrimary: -1,
      sortOrder: 1,
      createdAt: 1,
    });
    res.json({ items: items.map(serializeForAdmin) });
  }),

  // Accepts one or many files (multer .array), appending them after any
  // existing images for the tour so their order is preserved.
  create: asyncHandler(async (req: Request, res: Response) => {
    const tourId = req.body.tourId as string | undefined;
    if (!tourId) throw ApiError.badRequest("tourId is required");

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) throw ApiError.badRequest("At least one image file is required");

    const last = await TourMedia.findOne({ tourId }).sort({ sortOrder: -1 });
    let nextOrder = (last?.sortOrder ?? -1) + 1;

    const created = [];
    for (const file of files) {
      const stored = await s3Adapter.save("tourMedia", file.path, file.originalname);
      const item = await TourMedia.create({ tourId, file: stored.key, sortOrder: nextOrder });
      nextOrder += 1;
      created.push(serializeForAdmin(item));
    }

    res.status(201).json({ items: created });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const existing = await TourMedia.findById(req.params.id);
    if (!existing) throw ApiError.notFound("Image not found");

    const { title, alt, sortOrder, isPrimary } = req.body as Record<string, unknown>;
    if (title !== undefined) existing.title = title as string;
    if (alt !== undefined) existing.alt = alt as string;
    if (sortOrder !== undefined) existing.sortOrder = Number(sortOrder);
    if (isPrimary !== undefined) existing.isPrimary = isPrimary === true || isPrimary === "true";

    // Only one primary image per tour.
    if (existing.isPrimary) {
      await TourMedia.updateMany(
        { tourId: existing.tourId, _id: { $ne: existing._id } },
        { $set: { isPrimary: false } },
      );
    }

    await existing.save();
    res.json({ item: serializeForAdmin(existing) });
  }),

  // Persists a new display order — body.ids lists the image ids in the order
  // the content team arranged them.
  reorder: asyncHandler(async (req: Request, res: Response) => {
    const ids = req.body.ids as string[];
    await Promise.all(ids.map((id, i) => TourMedia.updateOne({ _id: id }, { $set: { sortOrder: i } })));
    res.json({ ok: true });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const item = await TourMedia.findByIdAndDelete(req.params.id);
    if (!item) throw ApiError.notFound("Image not found");
    if (item.file) await s3Adapter.remove(item.file as string).catch(() => undefined);
    res.status(204).send();
  }),
};
