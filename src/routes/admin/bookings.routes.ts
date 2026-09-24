import { Router } from "express";

import * as bookingController from "../../controllers/admin/booking.controller.js";
import { requireAdminAuth } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {
  bookingTransactionParamSchema,
  idParamSchema,
  recordOfficePaymentSchema,
  refundBookingSchema,
  voidOfficePaymentSchema,
} from "../../validators/booking.validators.js";

export const adminBookingsRoutes = Router();

adminBookingsRoutes.use(requireAdminAuth, requireRole("admin"));

adminBookingsRoutes.get("/", bookingController.list);
adminBookingsRoutes.get("/:id", validate({ params: idParamSchema }), bookingController.get);
adminBookingsRoutes.post(
  "/:id/refund",
  validate({ params: idParamSchema, body: refundBookingSchema }),
  bookingController.refund,
);
adminBookingsRoutes.post(
  "/:id/payments",
  validate({ params: idParamSchema, body: recordOfficePaymentSchema }),
  bookingController.recordPayment,
);
adminBookingsRoutes.post(
  "/:id/payments/:txnId/void",
  validate({ params: bookingTransactionParamSchema, body: voidOfficePaymentSchema }),
  bookingController.voidPayment,
);
