import { Router } from "express";

import { getHome } from "../../controllers/public/home.controller.js";

export const homeRoutes = Router();

homeRoutes.get("/", getHome);
