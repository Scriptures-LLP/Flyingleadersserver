import type { Request, Response } from "express";

import { TourDate } from "../../models/TourDate.js";
import { syncTourDateRemove, syncTourDateUpsert } from "../../mysql/sync/tourDateSync.js";
import { runMysqlSync } from "../../mysql/syncStatus.js";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

// The admin form (a generic CRUD grid) can only bind flat checkbox fields,
// not a nested object — this flattens appliesTo for it on the way out, the
// mirror of validators/entities.validators.ts#reshapeAppliesTo on the way in.
function serializeForAdmin(item: InstanceType<typeof TourDate>) {
  const obj = item.toObject();
  return {
    ...obj,
    appliesToAdult: obj.appliesTo?.adult ?? true,
    appliesToChild: obj.appliesTo?.child ?? true,
    appliesToInfant: obj.appliesTo?.infant ?? true,
  };
}

export const tourDateController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const filter = req.query.tourId ? { tourId: req.query.tourId } : {};
    // Newest-added first (the admin table regroups these by tour client-side).
    const items = await TourDate.find(filter).sort({ createdAt: -1 });
    res.json({ items: items.map(serializeForAdmin) });
  }),

  get: asyncHandler(async (req: Request, res: Response) => {
    const item = await TourDate.findById(req.params.id);
    if (!item) throw ApiError.notFound("Tour date not found");
    res.json({ item: serializeForAdmin(item) });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const item = await TourDate.create(req.body);
    await runMysqlSync(TourDate, item, () => syncTourDateUpsert(item));
    res.status(201).json({ item: serializeForAdmin(item) });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const item = await TourDate.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!item) throw ApiError.notFound("Tour date not found");
    await runMysqlSync(TourDate, item, () => syncTourDateUpsert(item));
    res.json({ item: serializeForAdmin(item) });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const item = await TourDate.findByIdAndDelete(req.params.id);
    if (!item) throw ApiError.notFound("Tour date not found");
    await syncTourDateRemove(item.legacySourceTable, item.legacyMysqlId as number | undefined).catch((err) =>
      console.error("[mysql-sync] failed to remove tour date:", err),
    );
    res.status(204).send();
  }),

  resync: asyncHandler(async (req: Request, res: Response) => {
    const item = await TourDate.findById(req.params.id);
    if (!item) throw ApiError.notFound("Tour date not found");
    await runMysqlSync(TourDate, item, () => syncTourDateUpsert(item));
    const refreshed = await TourDate.findById(item._id);
    res.json({ item: refreshed ? serializeForAdmin(refreshed) : refreshed });
  }),
};
