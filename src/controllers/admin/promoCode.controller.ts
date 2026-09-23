import type { Request, Response } from "express";

import { PromoCode } from "../../models/PromoCode.js";
import { syncPromoCodeRemove, syncPromoCodeUpsert } from "../../mysql/sync/promoCodeSync.js";
import { usageByPromo } from "../../services/promoUsage.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { makeCrudController } from "./crudFactory.js";

const crud = makeCrudController(PromoCode, "Promo code", {
  upsert: syncPromoCodeUpsert,
  remove: syncPromoCodeRemove,
});

export const promoCodeController = {
  ...crud,

  // Same list as the generic one, plus how many times each code has actually
  // been used (`usedCount`: paid or partly paid bookings) and how many unpaid
  // bookings are currently holding a use (`heldCount`) — so an admin can see a
  // limit being consumed instead of guessing.
  list: asyncHandler(async (_req: Request, res: Response) => {
    const [promos, usage] = await Promise.all([PromoCode.find().sort({ createdAt: -1 }), usageByPromo()]);
    const items = promos.map((p) => ({
      ...p.toJSON(),
      usedCount: usage.get(String(p._id))?.redeemed ?? 0,
      heldCount: usage.get(String(p._id))?.held ?? 0,
    }));
    res.json({ items });
  }),
};
