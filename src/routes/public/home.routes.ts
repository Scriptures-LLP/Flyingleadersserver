import { Router } from "express";

import { getHome } from "../../controllers/public/home.controller.js";
import { env } from "../../config/env.js";
import { cacheRoute } from "../../services/cache.service.js";

export const homeRoutes = Router();

homeRoutes.get("/", cacheRoute("home", env.CACHE_TTL_HOME), getHome);
