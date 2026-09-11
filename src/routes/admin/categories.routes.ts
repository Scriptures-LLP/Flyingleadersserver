import { Router } from "express";

import { categoryController } from "../../controllers/admin/category.controller.js";
import { requireAdminAuth } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { upload } from "../../middlewares/upload.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { categorySchema, idParamSchema } from "../../validators/catalog.validators.js";

export const adminCategoriesRoutes = Router();

adminCategoriesRoutes.use(requireAdminAuth, requireRole("admin"));

adminCategoriesRoutes.get("/", categoryController.list);
adminCategoriesRoutes.get("/:id", validate({ params: idParamSchema }), categoryController.get);
adminCategoriesRoutes.post(
  "/",
  upload.single("image"),
  validate({ body: categorySchema }),
  categoryController.create,
);
adminCategoriesRoutes.put(
  "/:id",
  upload.single("image"),
  validate({ params: idParamSchema, body: categorySchema.partial() }),
  categoryController.update,
);
adminCategoriesRoutes.delete("/:id", validate({ params: idParamSchema }), categoryController.remove);
