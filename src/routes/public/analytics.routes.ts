import { Router } from "express";

import * as analyticsController from "../../controllers/public/analytics.controller.js";
import { optionalAuth } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { trackSchema } from "../../validators/analytics.validators.js";

export const analyticsRoutes = Router();

// Anonymous-friendly: guests and signed-in users both report activity. A valid
// token (if present) attaches the customer; no token is fine.
analyticsRoutes.post("/track", optionalAuth, validate({ body: trackSchema }), analyticsController.track);
