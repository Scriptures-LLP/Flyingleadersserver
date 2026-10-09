import { Router } from "express";

import * as websiteBookingController from "../../controllers/admin/websiteBooking.controller.js";
import { requireAdminAuth } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";

export const adminWebsiteBookingsRoutes = Router();

adminWebsiteBookingsRoutes.use(requireAdminAuth, requireRole("admin"));

adminWebsiteBookingsRoutes.get("/", websiteBookingController.list);
adminWebsiteBookingsRoutes.get("/:id", websiteBookingController.get);
