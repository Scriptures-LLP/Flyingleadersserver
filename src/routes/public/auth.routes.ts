import { Router } from "express";

import * as authController from "../../controllers/public/auth.controller.js";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { loginSchema, signupSchema } from "../../validators/auth.validators.js";
import { updateProfileSchema } from "../../validators/profile.validators.js";

export const authRoutes = Router();

authRoutes.post("/signup", validate({ body: signupSchema }), authController.signup);
authRoutes.post("/login", validate({ body: loginSchema }), authController.login);
authRoutes.get("/me", requireAuth, authController.me);
authRoutes.patch("/me", requireAuth, validate({ body: updateProfileSchema }), authController.updateMe);
