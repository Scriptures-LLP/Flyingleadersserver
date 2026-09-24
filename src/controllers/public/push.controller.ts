import type { Request, Response } from "express";

import { Notification } from "../../models/Notification.js";
import { registerPushToken, unregisterPushToken } from "../../services/push.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { token, platform, deviceName } = req.body as { token: string; platform: "android" | "ios"; deviceName?: string };
  await registerPushToken(req.customer!.sub, token, platform, deviceName);
  res.status(204).send();
});

export const unregister = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body as { token: string };
  await unregisterPushToken(req.customer!.sub, token);
  res.status(204).send();
});

// The customer's inbox — what the bell in the app lists — newest first.
export const listMine = asyncHandler(async (req: Request, res: Response) => {
  const customerId = req.customer!.sub;
  const [items, unread] = await Promise.all([
    Notification.find({ customerId }).sort({ createdAt: -1 }).limit(50).select("-campaignId"),
    Notification.countDocuments({ customerId, readAt: { $exists: false } }),
  ]);
  res.json({ items, unread });
});

export const unreadCount = asyncHandler(async (req: Request, res: Response) => {
  res.json({ unread: await Notification.countDocuments({ customerId: req.customer!.sub, readAt: { $exists: false } }) });
});

// Marks the given notifications read — or all of the customer's, when no ids are sent.
export const markRead = asyncHandler(async (req: Request, res: Response) => {
  const { ids } = req.body as { ids?: string[] };
  await Notification.updateMany(
    { customerId: req.customer!.sub, readAt: { $exists: false }, ...(ids?.length ? { _id: { $in: ids } } : {}) },
    { $set: { readAt: new Date() } },
  );
  res.status(204).send();
});
