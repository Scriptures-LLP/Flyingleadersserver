import { z } from "zod";

import { PUSH_TOKEN_RE } from "../services/push.service.js";

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");

export const registerPushSchema = z.object({
  token: z.string().trim().regex(PUSH_TOKEN_RE, "That doesn't look like a push token"),
  platform: z.enum(["android", "ios"]).default("android"),
  deviceName: z.string().trim().max(80).optional(),
});
export const unregisterPushSchema = z.object({ token: z.string().trim().min(1) });

export const markReadSchema = z.object({ ids: z.array(objectId).max(200).optional() });

const audienceSchema = z
  .object({
    type: z.enum(["all", "customer", "tour_booked", "balance_due", "travelling_soon", "never_booked"]),
    tourId: objectId.optional(),
    customerId: objectId.optional(),
    days: z.coerce.number().int().min(1).max(365).optional(),
  })
  .superRefine((a, ctx) => {
    if (a.type === "tour_booked" && !a.tourId) ctx.addIssue({ code: "custom", message: "Choose a tour", path: ["tourId"] });
    if (a.type === "customer" && !a.customerId) ctx.addIssue({ code: "custom", message: "Choose a customer", path: ["customerId"] });
  });

export const sendNotificationSchema = z.object({
  title: z.string().trim().min(1, "Enter a title").max(65, "Keep the title under 65 characters"),
  body: z.string().trim().min(1, "Enter a message").max(240, "Keep the message under 240 characters"),
  category: z.enum(["promotions", "bookingUpdates", "tripReminders"]).default("promotions"),
  audience: audienceSchema,
  // Where tapping it opens.
  opens: z.enum(["home", "tour", "trips", "referral"]).default("home"),
  tourSlug: z.string().trim().min(1).optional(),
});

export const previewAudienceSchema = z.object({
  type: audienceSchema.innerType().shape.type,
  tourId: objectId.optional(),
  customerId: objectId.optional(),
  days: z.coerce.number().int().min(1).max(365).optional(),
  category: z.enum(["promotions", "bookingUpdates", "tripReminders"]).default("promotions"),
});
