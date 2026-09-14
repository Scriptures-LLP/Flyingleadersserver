import { Router } from "express";

import * as paymentController from "../../controllers/public/payment.controller.js";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { createPaymentOrderSchema, verifyPaymentSchema } from "../../validators/booking.validators.js";

export const paymentsRoutes = Router();

paymentsRoutes.use(requireAuth);

paymentsRoutes.post("/orders", validate({ body: createPaymentOrderSchema }), paymentController.createOrder);
paymentsRoutes.post("/verify", validate({ body: verifyPaymentSchema }), paymentController.verify);
paymentsRoutes.get("/mine", paymentController.listMine);
