import type { Request, Response } from "express";

import { Tour } from "../../models/Tour.js";
import { Wishlist } from "../../models/Wishlist.js";
import { serializeTourSummary } from "../../services/tourSerializer.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const entries = await Wishlist.find({ customerId: req.customer!.sub }).sort({ createdAt: -1 });
  const tourIds = entries.map((e) => e.tourId);
  const tours = await Tour.find({ _id: { $in: tourIds } });
  const byId = new Map(tours.map((t) => [String(t._id), t]));

  // Preserve wishlist order; silently drop any tour that's since been deleted.
  const items = entries
    .map((e) => byId.get(String(e.tourId)))
    .filter((t): t is NonNullable<typeof t> => !!t)
    .map(serializeTourSummary);

  res.json({ items });
});

export const add = asyncHandler(async (req: Request, res: Response) => {
  const { tourId } = req.body as { tourId: string };
  await Wishlist.updateOne(
    { customerId: req.customer!.sub, tourId },
    { customerId: req.customer!.sub, tourId },
    { upsert: true },
  );
  res.status(201).json({ ok: true });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await Wishlist.deleteOne({ customerId: req.customer!.sub, tourId: req.params.tourId });
  res.status(204).send();
});
