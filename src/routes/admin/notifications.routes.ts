import { Router } from "express";

import * as notificationController from "../../controllers/admin/notification.controller.js";
import { requireAdminAuth } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { previewAudienceSchema, sendNotificationSchema } from "../../validators/push.validators.js";

export const adminNotificationsRoutes = Router();

adminNotificationsRoutes.use(requireAdminAuth, requireRole("admin"));

adminNotificationsRoutes.get("/", notificationController.history);
adminNotificationsRoutes.get("/preview", validate({ query: previewAudienceSchema }), notificationController.preview);
adminNotificationsRoutes.get("/customers", notificationController.findCustomers);
adminNotificationsRoutes.post("/send", validate({ body: sendNotificationSchema }), notificationController.send);
