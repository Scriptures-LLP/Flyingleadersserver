import type { Request, Response } from "express";
import type { Model } from "mongoose";

import { runMysqlSync } from "../../mysql/syncStatus.js";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

type SyncConfig = {
  upsert: (doc: any) => Promise<number | void>;
  remove: (legacyMysqlId?: number) => Promise<void>;
};

/**
 * Simple CRUD controller for flat admin-managed reference data (Airport, PromoCode, ...).
 * `serialize` reshapes a document on the way out — used where the admin grid can only
 * bind flat fields (e.g. flattening a nested `appliesTo` into checkbox fields).
 */
export function makeCrudController(
  model: Model<any>,
  resourceName: string,
  sync?: SyncConfig,
  serialize: (doc: any) => unknown = (doc) => doc,
) {
  const controller = {
    list: asyncHandler(async (_req: Request, res: Response) => {
      const items = await model.find().sort({ sortOrder: 1, createdAt: -1 });
      res.json({ items: items.map(serialize) });
    }),

    get: asyncHandler(async (req: Request, res: Response) => {
      const item = await model.findById(req.params.id);
      if (!item) throw ApiError.notFound(`${resourceName} not found`);
      res.json({ item: serialize(item) });
    }),

    create: asyncHandler(async (req: Request, res: Response) => {
      const item = await model.create(req.body);
      if (sync) await runMysqlSync(model, item, () => sync.upsert(item));
      res.status(201).json({ item: serialize(item) });
    }),

    update: asyncHandler(async (req: Request, res: Response) => {
      const item = await model.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true,
      });
      if (!item) throw ApiError.notFound(`${resourceName} not found`);
      if (sync) await runMysqlSync(model, item, () => sync.upsert(item));
      res.json({ item: serialize(item) });
    }),

    remove: asyncHandler(async (req: Request, res: Response) => {
      const item = await model.findByIdAndDelete(req.params.id);
      if (!item) throw ApiError.notFound(`${resourceName} not found`);
      if (sync) {
        await sync
          .remove(item.legacyMysqlId as number | undefined)
          .catch((err) => console.error(`[mysql-sync] failed to remove ${resourceName}:`, err));
      }
      res.status(204).send();
    }),

    resync: asyncHandler(async (req: Request, res: Response) => {
      if (!sync) throw ApiError.notFound("Sync not configured for this resource");
      const item = await model.findById(req.params.id);
      if (!item) throw ApiError.notFound(`${resourceName} not found`);
      await runMysqlSync(model, item, () => sync.upsert(item));
      const refreshed = await model.findById(item._id);
      res.json({ item: refreshed ? serialize(refreshed) : refreshed });
    }),
  };

  return controller;
}
