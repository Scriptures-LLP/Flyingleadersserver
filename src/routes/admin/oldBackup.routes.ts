import { Router } from "express";

import * as oldBackupController from "../../controllers/admin/oldBackup.controller.js";
import { requireAdminAuth } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";

export const adminOldBackupRoutes = Router();

adminOldBackupRoutes.use(requireAdminAuth, requireRole("admin"));

adminOldBackupRoutes.get("/bookings", oldBackupController.bookings);
adminOldBackupRoutes.get("/booking-travellers", oldBackupController.bookingTravellers);
adminOldBackupRoutes.get("/contact-messages", oldBackupController.contactMessages);
adminOldBackupRoutes.get("/contact-queries", oldBackupController.contactQueries);
