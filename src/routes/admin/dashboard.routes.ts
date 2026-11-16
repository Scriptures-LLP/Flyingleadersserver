import { Router } from "express";

import * as dashboardController from "../../controllers/admin/dashboard.controller.js";
import { requireAdminAuth } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";

export const adminDashboardRoutes = Router();

adminDashboardRoutes.use(requireAdminAuth, requireRole("admin"));

adminDashboardRoutes.get("/", dashboardController.summary);
