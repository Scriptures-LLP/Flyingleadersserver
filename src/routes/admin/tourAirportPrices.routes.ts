import { Router } from "express";

import { tourAirportPriceController } from "../../controllers/admin/tourAirportPrice.controller.js";
import { requireAdminAuth } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { idParamSchema, tourAirportPriceSchema } from "../../validators/entities.validators.js";

export const adminTourAirportPricesRoutes = Router();

adminTourAirportPricesRoutes.use(requireAdminAuth, requireRole("admin"));

adminTourAirportPricesRoutes.get("/", tourAirportPriceController.list);
adminTourAirportPricesRoutes.get("/:id", validate({ params: idParamSchema }), tourAirportPriceController.get);
adminTourAirportPricesRoutes.post("/", validate({ body: tourAirportPriceSchema }), tourAirportPriceController.create);
adminTourAirportPricesRoutes.put(
  "/:id",
  validate({ params: idParamSchema, body: tourAirportPriceSchema.partial() }),
  tourAirportPriceController.update,
);
adminTourAirportPricesRoutes.delete("/:id", validate({ params: idParamSchema }), tourAirportPriceController.remove);
adminTourAirportPricesRoutes.post(
  "/:id/resync",
  validate({ params: idParamSchema }),
  tourAirportPriceController.resync,
);
