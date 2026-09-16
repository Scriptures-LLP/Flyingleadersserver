import { Router } from "express";
import { z } from "zod";

import * as referralController from "../../controllers/admin/referral.controller.js";
import { requireAdminAuth } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";

export const adminReferralsRoutes = Router();

adminReferralsRoutes.use(requireAdminAuth, requireRole("admin"));

adminReferralsRoutes.get("/", referralController.listReferrals);
adminReferralsRoutes.get("/wallets", referralController.listWallets);
adminReferralsRoutes.post(
  "/wallets/:customerId/adjust",
  validate({
    params: z.object({ customerId: z.string().min(1) }),
    // Signed on purpose — negative issues a correction/deduction.
    body: z.object({ amount: z.coerce.number(), note: z.string().trim().optional() }),
  }),
  referralController.adjustWallet,
);
