import { Router } from "express";

import { homeCoverController } from "../../controllers/admin/homeCover.controller.js";
import { requireAdminAuth } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { upload } from "../../middlewares/upload.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { homeCoverSchema, idParamSchema } from "../../validators/entities.validators.js";

export const adminHomeCoversRoutes = Router();

adminHomeCoversRoutes.use(requireAdminAuth, requireRole("admin"));

adminHomeCoversRoutes.get("/", homeCoverController.list);
adminHomeCoversRoutes.get("/:id", validate({ params: idParamSchema }), homeCoverController.get);
adminHomeCoversRoutes.post(
  "/",
  upload.single("image"),
  validate({ body: homeCoverSchema }),
  homeCoverController.create,
);
adminHomeCoversRoutes.put(
  "/:id",
  upload.single("image"),
  validate({ params: idParamSchema, body: homeCoverSchema.partial() }),
  homeCoverController.update,
);
adminHomeCoversRoutes.delete("/:id", validate({ params: idParamSchema }), homeCoverController.remove);
adminHomeCoversRoutes.post("/:id/resync", validate({ params: idParamSchema }), homeCoverController.resync);
