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
    const baseOrder = (last?.sortOrder ?? -1) + 1;

    // Upload the images concurrently instead of one-after-another. Each file
    // does an S3 PUT (network) + a sharp re-encode (CPU) + a Mongo write; doing
    // them sequentially made creating a tour with several photos take minutes on
    // the constrained production instance. Bounded concurrency overlaps the
    // network waits without loading every original into memory at once (OOM
    // risk on a 512MB box). `sortOrder = baseOrder + index` keeps the gallery in
    // the order the files were submitted, regardless of which finishes first.
    const CONCURRENCY = 4;
    const created: ReturnType<typeof serializeForAdmin>[] = new Array(files.length);
    for (let start = 0; start < files.length; start += CONCURRENCY) {
      const batch = files.slice(start, start + CONCURRENCY);
      await Promise.all(
        batch.map(async (file, j) => {
          const index = start + j;
          const stored = await s3Adapter.save("tourMedia", file.path, file.originalname);
          const item = await TourMedia.create({ tourId, file: stored.key, sortOrder: baseOrder + index });
          created[index] = serializeForAdmin(item);
        }),
      );
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
