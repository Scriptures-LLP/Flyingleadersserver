import { Router } from "express";
import { z } from "zod";

import * as wishlistController from "../../controllers/public/wishlist.controller.js";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";

export const wishlistRoutes = Router();

wishlistRoutes.use(requireAuth);

wishlistRoutes.get("/", wishlistController.list);
wishlistRoutes.post("/", validate({ body: z.object({ tourId: z.string().min(1) }) }), wishlistController.add);
wishlistRoutes.delete(
  "/:tourId",
  validate({ params: z.object({ tourId: z.string().min(1) }) }),
  wishlistController.remove,
);
