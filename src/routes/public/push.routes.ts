import { Router } from "express";

import * as pushController from "../../controllers/public/push.controller.js";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { markReadSchema, registerPushSchema, unregisterPushSchema } from "../../validators/push.validators.js";

export const pushRoutes = Router();
pushRoutes.use(requireAuth);

// This phone's push token, so we can reach it.
pushRoutes.post("/register", validate({ body: registerPushSchema }), pushController.register);
pushRoutes.post("/unregister", validate({ body: unregisterPushSchema }), pushController.unregister);

export const notificationsRoutes = Router();
notificationsRoutes.use(requireAuth);

// The in-app inbox.
notificationsRoutes.get("/mine", pushController.listMine);
notificationsRoutes.get("/unread-count", pushController.unreadCount);
notificationsRoutes.post("/read", validate({ body: markReadSchema }), pushController.markRead);
