import type { Request, Response } from "express";

import { TourDate } from "../../models/TourDate.js";
import { syncTourDateRemove, syncTourDateUpsert } from "../../mysql/sync/tourDateSync.js";
import { runMysqlSync } from "../../mysql/syncStatus.js";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const tourDateController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const filter = req.query.tourId ? { tourId: req.query.tourId } : {};
    const items = await TourDate.find(filter).sort({ date: 1 });
    res.json({ items });
  }),

  get: asyncHandler(async (req: Request, res: Response) => {
    const item = await TourDate.findById(req.params.id);
    if (!item) throw ApiError.notFound("Tour date not found");
    res.json({ item });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const item = await TourDate.create(req.body);
    await runMysqlSync(TourDate, item, () => syncTourDateUpsert(item));
    res.status(201).json({ item });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const item = await TourDate.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!item) throw ApiError.notFound("Tour date not found");
    await runMysqlSync(TourDate, item, () => syncTourDateUpsert(item));
    res.json({ item });
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
    res.json({ item: refreshed });
  }),
};
