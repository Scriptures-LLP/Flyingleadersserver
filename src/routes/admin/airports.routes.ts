import { Router } from "express";

import { airportController } from "../../controllers/admin/airport.controller.js";
import { requireAdminAuth } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { airportSchema, idParamSchema } from "../../validators/catalog.validators.js";

export const adminAirportsRoutes = Router();

adminAirportsRoutes.use(requireAdminAuth, requireRole("admin"));

adminAirportsRoutes.get("/", airportController.list);
adminAirportsRoutes.get("/:id", validate({ params: idParamSchema }), airportController.get);
adminAirportsRoutes.post("/", validate({ body: airportSchema }), airportController.create);
adminAirportsRoutes.put(
  "/:id",
  validate({ params: idParamSchema, body: airportSchema.partial() }),
  airportController.update,
);
adminAirportsRoutes.delete("/:id", validate({ params: idParamSchema }), airportController.remove);
adminAirportsRoutes.post("/:id/resync", validate({ params: idParamSchema }), airportController.resync);
