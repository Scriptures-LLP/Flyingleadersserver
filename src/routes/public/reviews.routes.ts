import { Router } from "express";

import * as reviewController from "../../controllers/public/review.controller.js";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { createReviewSchema } from "../../validators/review.validators.js";

export const reviewsRoutes = Router();

reviewsRoutes.use(requireAuth);
reviewsRoutes.post("/", validate({ body: createReviewSchema }), reviewController.create);
reviewsRoutes.get("/mine", reviewController.listMine);
