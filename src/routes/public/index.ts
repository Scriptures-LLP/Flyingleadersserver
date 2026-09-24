import { Router } from "express";

import { addressesRoutes } from "./addresses.routes.js";
import { authRoutes } from "./auth.routes.js";
import { bookingsRoutes } from "./bookings.routes.js";
import { categoriesRoutes } from "./categories.routes.js";
import { chatRoutes } from "./chat.routes.js";
import { configRoutes } from "./config.routes.js";
import { countriesRoutes } from "./countries.routes.js";
import { homeRoutes } from "./home.routes.js";
import { paymentsRoutes } from "./payments.routes.js";
import { notificationsRoutes, pushRoutes } from "./push.routes.js";
import { referralsRoutes } from "./referrals.routes.js";
import { reviewsRoutes } from "./reviews.routes.js";
import { termsRoutes } from "./terms.routes.js";
import { toursRoutes } from "./tours.routes.js";
import { wishlistRoutes } from "./wishlist.routes.js";

export const publicRoutes = Router();

publicRoutes.use("/auth", authRoutes);
publicRoutes.use("/home", homeRoutes);
publicRoutes.use("/categories", categoriesRoutes);
publicRoutes.use("/countries", countriesRoutes);
publicRoutes.use("/tours", toursRoutes);
publicRoutes.use("/bookings", bookingsRoutes);
publicRoutes.use("/payments", paymentsRoutes);
publicRoutes.use("/addresses", addressesRoutes);
publicRoutes.use("/chat", chatRoutes);
publicRoutes.use("/wishlist", wishlistRoutes);
publicRoutes.use("/reviews", reviewsRoutes);
publicRoutes.use("/referrals", referralsRoutes);
publicRoutes.use("/push", pushRoutes);
publicRoutes.use("/notifications", notificationsRoutes);
publicRoutes.use("/terms", termsRoutes);
publicRoutes.use("/config", configRoutes);
