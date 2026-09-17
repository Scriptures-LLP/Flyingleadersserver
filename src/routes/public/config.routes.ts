import { Router } from "express";

import * as configController from "../../controllers/public/config.controller.js";

export const configRoutes = Router();

configRoutes.get("/", configController.getConfig);
