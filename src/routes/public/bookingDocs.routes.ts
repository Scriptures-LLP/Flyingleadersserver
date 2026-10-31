import { Router } from "express";

import * as bookingController from "../../controllers/public/booking.controller.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { idParamSchema } from "../../validators/booking.validators.js";

// Deliberately NOT behind requireAuth (see bookingController.tripSummaryPdfByToken) --
// this is what lets an outside service like Gupshup/WhatsApp fetch the PDF to attach
// it as a document, which it can't do with a customer's login Bearer token.
export const bookingDocsRoutes = Router();

bookingDocsRoutes.get(
  "/:id/trip-summary.pdf",
  validate({ params: idParamSchema }),
  bookingController.tripSummaryPdfByToken,
);
