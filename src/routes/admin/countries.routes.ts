import { Router } from "express";

import { countryController } from "../../controllers/admin/country.controller.js";
import { requireAdminAuth } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { upload } from "../../middlewares/upload.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { countrySchema, idParamSchema } from "../../validators/catalog.validators.js";

export const adminCountriesRoutes = Router();

adminCountriesRoutes.use(requireAdminAuth, requireRole("admin"));

adminCountriesRoutes.get("/", countryController.list);
adminCountriesRoutes.get("/:id", validate({ params: idParamSchema }), countryController.get);
adminCountriesRoutes.post(
  "/",
  upload.single("coverImage"),
  validate({ body: countrySchema }),
  countryController.create,
);
adminCountriesRoutes.put(
  "/:id",
  upload.single("coverImage"),
  validate({ params: idParamSchema, body: countrySchema.partial() }),
  countryController.update,
);
adminCountriesRoutes.delete("/:id", validate({ params: idParamSchema }), countryController.remove);
adminCountriesRoutes.post("/:id/resync", validate({ params: idParamSchema }), countryController.resync);
