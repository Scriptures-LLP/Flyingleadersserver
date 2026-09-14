import { Router } from "express";

import { settingController } from "../../controllers/admin/setting.controller.js";
import { requireAdminAuth } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { settingValueSchema } from "../../validators/entities.validators.js";
import { z } from "zod";

export const adminSettingsRoutes = Router();

adminSettingsRoutes.use(requireAdminAuth, requireRole("admin"));

const keyParamSchema = z.object({ key: z.string().min(1) });

adminSettingsRoutes.get("/:key", validate({ params: keyParamSchema }), settingController.get);
adminSettingsRoutes.put(
  "/:key",
  validate({ params: keyParamSchema, body: settingValueSchema }),
  settingController.set,
);
