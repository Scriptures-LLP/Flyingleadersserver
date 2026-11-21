import { Router } from "express";

import { env } from "../../config/env.js";
import * as categoryController from "../../controllers/public/category.controller.js";
import { cacheRoute } from "../../services/cache.service.js";

export const categoriesRoutes = Router();

categoriesRoutes.get("/", cacheRoute("categories", env.CACHE_TTL_CATEGORIES), categoryController.list);
