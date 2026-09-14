import { Router } from "express";

import { promoCodeController } from "../../controllers/admin/promoCode.controller.js";
import { requireAdminAuth } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { idParamSchema, promoCodeSchema } from "../../validators/entities.validators.js";

export const adminPromoCodesRoutes = Router();

adminPromoCodesRoutes.use(requireAdminAuth, requireRole("admin"));

adminPromoCodesRoutes.get("/", promoCodeController.list);
adminPromoCodesRoutes.get("/:id", validate({ params: idParamSchema }), promoCodeController.get);
adminPromoCodesRoutes.post("/", validate({ body: promoCodeSchema }), promoCodeController.create);
adminPromoCodesRoutes.put(
  "/:id",
  validate({ params: idParamSchema, body: promoCodeSchema.partial() }),
  promoCodeController.update,
);
adminPromoCodesRoutes.delete("/:id", validate({ params: idParamSchema }), promoCodeController.remove);
adminPromoCodesRoutes.post("/:id/resync", validate({ params: idParamSchema }), promoCodeController.resync);
