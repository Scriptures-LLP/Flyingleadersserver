import { Router } from "express";

import * as contactMessageController from "../../controllers/admin/contactMessage.controller.js";
import { requireAdminAuth } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";

export const adminContactMessagesRoutes = Router();

adminContactMessagesRoutes.use(requireAdminAuth, requireRole("admin"));

adminContactMessagesRoutes.get("/", contactMessageController.list);
