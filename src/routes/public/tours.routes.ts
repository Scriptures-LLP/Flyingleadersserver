import { Router } from "express";

import { env } from "../../config/env.js";
import * as reviewController from "../../controllers/public/review.controller.js";
import * as tourController from "../../controllers/public/tour.controller.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { cacheRoute } from "../../services/cache.service.js";
import { slugParamSchema, tourQuerySchema } from "../../validators/catalog.validators.js";

export const toursRoutes = Router();

// All five are public, user-agnostic reads. Listings/search/dates/airports share
// the "tours" namespace on the short listing TTL; the detail page gets the longer
// detail TTL. The cache key is the full URL, so each page/filter/slug is distinct.
toursRoutes.get("/", validate({ query: tourQuerySchema }), cacheRoute("tours", env.CACHE_TTL_TOURS), tourController.list);
toursRoutes.get("/:slug", validate({ params: slugParamSchema }), cacheRoute("tours", env.CACHE_TTL_TOUR_DETAIL), tourController.getBySlug);
toursRoutes.get("/:slug/reviews", validate({ params: slugParamSchema }), cacheRoute("tours", env.CACHE_TTL_TOURS), reviewController.listForTour);
toursRoutes.get("/:slug/dates", validate({ params: slugParamSchema }), cacheRoute("tours", env.CACHE_TTL_TOURS), tourController.listDates);
toursRoutes.get("/:slug/airports", validate({ params: slugParamSchema }), cacheRoute("tours", env.CACHE_TTL_TOURS), tourController.listAirports);
