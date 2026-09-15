import { Router } from "express";

import { adminAirportsRoutes } from "./airports.routes.js";
import { adminAuthRoutes } from "./auth.routes.js";
import { adminBookingsRoutes } from "./bookings.routes.js";
import { adminCategoriesRoutes } from "./categories.routes.js";
import { adminCountriesRoutes } from "./countries.routes.js";
import { adminCustomersRoutes } from "./customers.routes.js";
import { adminGalleryImagesRoutes } from "./galleryImages.routes.js";
import { adminHomeCoversRoutes } from "./homeCovers.routes.js";
import { adminPromoCodesRoutes } from "./promoCodes.routes.js";
import { adminSettingsRoutes } from "./settings.routes.js";
import { adminTourAirportPricesRoutes } from "./tourAirportPrices.routes.js";
import { adminTourDatesRoutes } from "./tourDates.routes.js";
import { adminToursRoutes } from "./tours.routes.js";

export const adminRoutes = Router();

adminRoutes.use("/auth", adminAuthRoutes);
adminRoutes.use("/tours", adminToursRoutes);
adminRoutes.use("/countries", adminCountriesRoutes);
adminRoutes.use("/airports", adminAirportsRoutes);
adminRoutes.use("/categories", adminCategoriesRoutes);
adminRoutes.use("/bookings", adminBookingsRoutes);
adminRoutes.use("/customers", adminCustomersRoutes);
adminRoutes.use("/promo-codes", adminPromoCodesRoutes);
adminRoutes.use("/tour-dates", adminTourDatesRoutes);
adminRoutes.use("/tour-airport-prices", adminTourAirportPricesRoutes);
adminRoutes.use("/gallery-images", adminGalleryImagesRoutes);
adminRoutes.use("/home-covers", adminHomeCoversRoutes);
adminRoutes.use("/settings", adminSettingsRoutes);
