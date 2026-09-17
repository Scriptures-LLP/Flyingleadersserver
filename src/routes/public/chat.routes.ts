import { Router } from "express";

import * as chatController from "../../controllers/public/chat.controller.js";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { sendMessageSchema } from "../../validators/chat.validators.js";

export const chatRoutes = Router();

chatRoutes.use(requireAuth);

chatRoutes.post("/messages", validate({ body: sendMessageSchema }), chatController.sendMessage);
chatRoutes.get("/history", chatController.getHistory);
chatRoutes.post("/new", chatController.startNew);
