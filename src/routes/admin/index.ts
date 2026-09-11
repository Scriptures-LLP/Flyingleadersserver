import { Router } from "express";

import { adminAirportsRoutes } from "./airports.routes.js";
import { adminAuthRoutes } from "./auth.routes.js";
import { adminCategoriesRoutes } from "./categories.routes.js";
import { adminCountriesRoutes } from "./countries.routes.js";
import { adminToursRoutes } from "./tours.routes.js";

export const adminRoutes = Router();

adminRoutes.use("/auth", adminAuthRoutes);
adminRoutes.use("/tours", adminToursRoutes);
adminRoutes.use("/countries", adminCountriesRoutes);
adminRoutes.use("/airports", adminAirportsRoutes);
adminRoutes.use("/categories", adminCategoriesRoutes);
