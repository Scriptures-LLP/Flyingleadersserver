import { Router } from "express";

import { authRoutes } from "./auth.routes.js";
import { categoriesRoutes } from "./categories.routes.js";
import { countriesRoutes } from "./countries.routes.js";
import { homeRoutes } from "./home.routes.js";
import { toursRoutes } from "./tours.routes.js";

export const publicRoutes = Router();

publicRoutes.use("/auth", authRoutes);
publicRoutes.use("/home", homeRoutes);
publicRoutes.use("/categories", categoriesRoutes);
publicRoutes.use("/countries", countriesRoutes);
publicRoutes.use("/tours", toursRoutes);
