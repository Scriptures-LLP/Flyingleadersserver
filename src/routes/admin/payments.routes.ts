import { Router } from "express";

import * as paymentController from "../../controllers/admin/payment.controller.js";
import { requireAdminAuth } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";

export const adminPaymentsRoutes = Router();

adminPaymentsRoutes.use(requireAdminAuth, requireRole("admin"));

adminPaymentsRoutes.get("/", paymentController.list);
