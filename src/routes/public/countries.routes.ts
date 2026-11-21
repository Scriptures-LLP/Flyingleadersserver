import { Router } from "express";

import { env } from "../../config/env.js";
import * as countryController from "../../controllers/public/country.controller.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { cacheRoute } from "../../services/cache.service.js";
import { slugParamSchema } from "../../validators/catalog.validators.js";

export const countriesRoutes = Router();

countriesRoutes.get("/", cacheRoute("countries", env.CACHE_TTL_COUNTRIES), countryController.list);
countriesRoutes.get("/:slug", validate({ params: slugParamSchema }), cacheRoute("countries", env.CACHE_TTL_COUNTRIES), countryController.getBySlug);
