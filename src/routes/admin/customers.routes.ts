import { Router } from "express";
import { z } from "zod";

import * as customerController from "../../controllers/admin/customer.controller.js";
import { requireAdminAuth } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";

export const adminCustomersRoutes = Router();

adminCustomersRoutes.use(requireAdminAuth, requireRole("admin"));

adminCustomersRoutes.get("/", customerController.list);
adminCustomersRoutes.patch(
  "/:id/active",
  validate({ params: z.object({ id: z.string().min(1) }), body: z.object({ isActive: z.coerce.boolean() }) }),
  customerController.setActive,
);
