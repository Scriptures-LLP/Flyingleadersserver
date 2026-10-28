import { Router } from "express";

import * as whatsappController from "../../controllers/admin/whatsapp.controller.js";
import { requireAdminAuth } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { createWhatsAppTemplateSchema, sendWhatsAppSchema } from "../../validators/whatsapp.validators.js";

export const adminWhatsAppRoutes = Router();

adminWhatsAppRoutes.use(requireAdminAuth, requireRole("admin"));

adminWhatsAppRoutes.post("/send", validate({ body: sendWhatsAppSchema }), whatsappController.send);
adminWhatsAppRoutes.get("/templates", whatsappController.listTemplates);
adminWhatsAppRoutes.post(
  "/templates",
  validate({ body: createWhatsAppTemplateSchema }),
  whatsappController.createTemplate,
);
