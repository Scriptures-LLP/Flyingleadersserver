import { Router } from "express";

import * as reviewController from "../../controllers/admin/review.controller.js";
import { requireAdminAuth } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { idParamSchema, moderateReviewSchema } from "../../validators/review.validators.js";

export const adminReviewsRoutes = Router();

adminReviewsRoutes.use(requireAdminAuth, requireRole("admin"));

adminReviewsRoutes.get("/", reviewController.list);
adminReviewsRoutes.patch(
  "/:id",
  validate({ params: idParamSchema, body: moderateReviewSchema }),
  reviewController.moderate,
);
