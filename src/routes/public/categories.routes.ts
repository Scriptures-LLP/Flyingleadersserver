import { Router } from "express";

import * as categoryController from "../../controllers/public/category.controller.js";

export const categoriesRoutes = Router();

categoriesRoutes.get("/", categoryController.list);
