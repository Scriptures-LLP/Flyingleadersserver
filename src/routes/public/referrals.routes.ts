import { Router } from "express";

import * as referralController from "../../controllers/public/referral.controller.js";
import { requireAuth } from "../../middlewares/auth.middleware.js";

export const referralsRoutes = Router();

referralsRoutes.use(requireAuth);
referralsRoutes.get("/mine", referralController.getMine);
