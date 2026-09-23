import { Router } from "express";

import * as reviewController from "../../controllers/public/review.controller.js";
import * as tourController from "../../controllers/public/tour.controller.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { slugParamSchema, tourQuerySchema } from "../../validators/catalog.validators.js";

export const toursRoutes = Router();

toursRoutes.get("/", validate({ query: tourQuerySchema }), tourController.list);
toursRoutes.get("/:slug", validate({ params: slugParamSchema }), tourController.getBySlug);
toursRoutes.get("/:slug/reviews", validate({ params: slugParamSchema }), reviewController.listForTour);
toursRoutes.get("/:slug/dates", validate({ params: slugParamSchema }), tourController.listDates);
toursRoutes.get("/:slug/airports", validate({ params: slugParamSchema }), tourController.listAirports);
