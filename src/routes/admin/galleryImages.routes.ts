import { Router } from "express";

import { galleryImageController } from "../../controllers/admin/galleryImage.controller.js";
import { requireAdminAuth } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { upload } from "../../middlewares/upload.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { galleryImageSchema, idParamSchema } from "../../validators/entities.validators.js";

export const adminGalleryImagesRoutes = Router();

adminGalleryImagesRoutes.use(requireAdminAuth, requireRole("admin"));

adminGalleryImagesRoutes.get("/", galleryImageController.list);
adminGalleryImagesRoutes.get("/:id", validate({ params: idParamSchema }), galleryImageController.get);
adminGalleryImagesRoutes.post(
  "/",
  upload.single("file"),
  validate({ body: galleryImageSchema }),
  galleryImageController.create,
);
adminGalleryImagesRoutes.put(
  "/:id",
  upload.single("file"),
  validate({ params: idParamSchema, body: galleryImageSchema.partial() }),
  galleryImageController.update,
);
adminGalleryImagesRoutes.delete("/:id", validate({ params: idParamSchema }), galleryImageController.remove);
adminGalleryImagesRoutes.post("/:id/resync", validate({ params: idParamSchema }), galleryImageController.resync);
