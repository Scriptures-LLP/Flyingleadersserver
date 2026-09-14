import { PromoCode } from "../../models/PromoCode.js";
import { syncPromoCodeRemove, syncPromoCodeUpsert } from "../../mysql/sync/promoCodeSync.js";
import { makeCrudController } from "./crudFactory.js";

export const promoCodeController = makeCrudController(PromoCode, "Promo code", {
  upsert: syncPromoCodeUpsert,
  remove: syncPromoCodeRemove,
});
