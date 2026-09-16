import { Router } from "express";

import * as termsController from "../../controllers/public/terms.controller.js";

export const termsRoutes = Router();

termsRoutes.get("/", termsController.getTerms);
