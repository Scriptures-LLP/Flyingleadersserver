import { Router } from "express";

import { tourMediaController } from "../../controllers/admin/tourMedia.controller.js";
import { requireAdminAuth } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { upload } from "../../middlewares/upload.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {
  idParamSchema,
  tourMediaCreateSchema,
  tourMediaReorderSchema,
  tourMediaUpdateSchema,
} from "../../validators/entities.validators.js";

export const adminTourMediaRoutes = Router();

adminTourMediaRoutes.use(requireAdminAuth, requireRole("admin"));

adminTourMediaRoutes.get("/", tourMediaController.list);
adminTourMediaRoutes.post(
  "/",
  upload.array("files", 20),
  validate({ body: tourMediaCreateSchema }),
  tourMediaController.create,
);
// Defined before "/:id" so the literal path isn't captured by the id param.
adminTourMediaRoutes.put(
  "/reorder",
  validate({ body: tourMediaReorderSchema }),
  tourMediaController.reorder,
);
adminTourMediaRoutes.put(
  "/:id",
  validate({ params: idParamSchema, body: tourMediaUpdateSchema }),
  tourMediaController.update,
);
adminTourMediaRoutes.delete("/:id", validate({ params: idParamSchema }), tourMediaController.remove);
