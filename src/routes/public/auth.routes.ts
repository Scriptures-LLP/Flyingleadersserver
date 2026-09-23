import { Router } from "express";

import * as authController from "../../controllers/public/auth.controller.js";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { otpSendIpLimit } from "../../middlewares/otpRateLimit.middleware.js";
import { upload } from "../../middlewares/upload.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import {
  forgotPasswordSchema,
  loginSchema,
  otpSendSchema,
  otpVerifyResetSchema,
  otpVerifySchema,
  phoneVerifySchema,
  resetWithTokenSchema,
  resetPasswordEmailSchema,
  resetPasswordSchema,
  signupSchema,
} from "../../validators/auth.validators.js";
import { updateProfileSchema } from "../../validators/profile.validators.js";

export const authRoutes = Router();

authRoutes.post("/signup", validate({ body: signupSchema }), authController.signup);
authRoutes.post("/login", validate({ body: loginSchema }), authController.login);
authRoutes.post("/phone-verify", validate({ body: phoneVerifySchema }), authController.phoneVerify);
authRoutes.post("/reset-password", validate({ body: resetPasswordSchema }), authController.resetPassword);
authRoutes.post("/forgot-password", validate({ body: forgotPasswordSchema }), authController.forgotPassword);
authRoutes.post(
  "/reset-password/email",
  validate({ body: resetPasswordEmailSchema }),
  authController.resetPasswordEmail,
);
// SMS OTP (MSG91): send a code, then sign in with it — or use it to reset a password.
authRoutes.post("/otp/send", otpSendIpLimit, validate({ body: otpSendSchema }), authController.otpSend);
authRoutes.post("/otp/verify", validate({ body: otpVerifySchema }), authController.otpVerify);
authRoutes.post("/otp/verify-reset", validate({ body: otpVerifyResetSchema }), authController.otpVerifyReset);
authRoutes.post(
  "/reset-password/token",
  validate({ body: resetWithTokenSchema }),
  authController.resetPasswordWithToken,
);
authRoutes.get("/me", requireAuth, authController.me);
authRoutes.patch("/me", requireAuth, validate({ body: updateProfileSchema }), authController.updateMe);
authRoutes.post("/me/photo", requireAuth, upload.single("avatar"), authController.updatePhoto);
