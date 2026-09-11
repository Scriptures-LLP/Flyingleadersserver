import { Router } from "express";

import * as adminAuthController from "../../controllers/admin/auth.controller.js";
import { requireAdminAuth } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { adminLoginSchema } from "../../validators/auth.validators.js";

export const adminAuthRoutes = Router();

adminAuthRoutes.post("/login", validate({ body: adminLoginSchema }), adminAuthController.login);
adminAuthRoutes.get("/me", requireAdminAuth, adminAuthController.me);
