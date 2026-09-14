import { Router } from "express";

import * as addressController from "../../controllers/public/address.controller.js";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { addressSchema, idParamSchema } from "../../validators/profile.validators.js";

export const addressesRoutes = Router();

addressesRoutes.use(requireAuth);

addressesRoutes.get("/", addressController.list);
addressesRoutes.post("/", validate({ body: addressSchema }), addressController.create);
addressesRoutes.patch(
  "/:id",
  validate({ params: idParamSchema, body: addressSchema.partial() }),
  addressController.update,
);
addressesRoutes.delete("/:id", validate({ params: idParamSchema }), addressController.remove);
