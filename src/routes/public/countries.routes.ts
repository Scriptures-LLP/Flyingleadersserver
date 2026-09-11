import { Router } from "express";

import * as countryController from "../../controllers/public/country.controller.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { slugParamSchema } from "../../validators/catalog.validators.js";

export const countriesRoutes = Router();

countriesRoutes.get("/", countryController.list);
countriesRoutes.get("/:slug", validate({ params: slugParamSchema }), countryController.getBySlug);
