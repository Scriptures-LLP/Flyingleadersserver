import { Router } from "express";

import { gupshupWebhook } from "../../controllers/public/gupshupWebhook.controller.js";

export const gupshupWebhookRoutes = Router();

gupshupWebhookRoutes.post("/gupshup", gupshupWebhook);
