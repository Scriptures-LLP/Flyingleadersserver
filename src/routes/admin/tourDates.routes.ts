import { Router } from "express";

import { tourDateController } from "../../controllers/admin/tourDate.controller.js";
import { requireAdminAuth } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { idParamSchema, tourDateSchema } from "../../validators/entities.validators.js";

export const adminTourDatesRoutes = Router();

adminTourDatesRoutes.use(requireAdminAuth, requireRole("admin"));

adminTourDatesRoutes.get("/", tourDateController.list);
adminTourDatesRoutes.get("/:id", validate({ params: idParamSchema }), tourDateController.get);
adminTourDatesRoutes.post("/", validate({ body: tourDateSchema }), tourDateController.create);
adminTourDatesRoutes.put(
  "/:id",
  validate({ params: idParamSchema, body: tourDateSchema.partial() }),
  tourDateController.update,
);
adminTourDatesRoutes.delete("/:id", validate({ params: idParamSchema }), tourDateController.remove);
adminTourDatesRoutes.post("/:id/resync", validate({ params: idParamSchema }), tourDateController.resync);
