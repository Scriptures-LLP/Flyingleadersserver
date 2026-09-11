import { Router } from "express";

import * as tourController from "../../controllers/admin/tour.controller.js";
import { requireAdminAuth } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { upload } from "../../middlewares/upload.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { idParamSchema, tourSchema } from "../../validators/catalog.validators.js";

export const adminToursRoutes = Router();

adminToursRoutes.use(requireAdminAuth, requireRole("admin"));

adminToursRoutes.get("/", tourController.list);
adminToursRoutes.get("/:id", validate({ params: idParamSchema }), tourController.get);
adminToursRoutes.post(
  "/",
  upload.single("coverImage"),
  validate({ body: tourSchema }),
  tourController.create,
);
adminToursRoutes.put(
  "/:id",
  upload.single("coverImage"),
  validate({ params: idParamSchema, body: tourSchema.partial() }),
  tourController.update,
);
adminToursRoutes.delete("/:id", validate({ params: idParamSchema }), tourController.remove);
adminToursRoutes.post("/:id/resync", validate({ params: idParamSchema }), tourController.resync);
