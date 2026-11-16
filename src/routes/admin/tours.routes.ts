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

// Itinerary day images (Wikimedia Commons). Read-only list + admin review/
// select/regenerate/manual-override. These operate on the saved itinerary text,
// never on the package gallery.
adminToursRoutes.get(
  "/:id/itinerary-images",
  validate({ params: idParamSchema }),
  tourController.listItineraryImages,
);
adminToursRoutes.post(
  "/:id/itinerary-images/suggest",
  validate({ params: idParamSchema }),
  tourController.suggestItineraryImage,
);
adminToursRoutes.post(
  "/:id/itinerary-images/regenerate",
  validate({ params: idParamSchema }),
  tourController.regenerateItineraryImages,
);
adminToursRoutes.post(
  "/:id/itinerary-images/select",
  validate({ params: idParamSchema }),
  tourController.selectItineraryImage,
);
adminToursRoutes.post(
  "/:id/itinerary-images/manual",
  upload.single("image"),
  validate({ params: idParamSchema }),
  tourController.setManualItineraryImage,
);
// No `validate({ params })` here: idParamSchema would strip the extra `:key`
// param (zod drops unknown keys). The handler checks both ids itself.
adminToursRoutes.delete("/:id/itinerary-images/:key", tourController.clearItineraryImage);
