import { Router } from "express";

import * as bookingController from "../../controllers/public/booking.controller.js";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { createBookingSchema, idParamSchema } from "../../validators/booking.validators.js";

export const bookingsRoutes = Router();

bookingsRoutes.use(requireAuth);

bookingsRoutes.post("/", validate({ body: createBookingSchema }), bookingController.create);
bookingsRoutes.get("/mine", bookingController.listMine);
bookingsRoutes.get("/:id", validate({ params: idParamSchema }), bookingController.getOne);
