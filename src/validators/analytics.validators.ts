import { z } from "zod";

import { APP_EVENT_TYPES } from "../models/AppEvent.js";

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");

const eventSchema = z.object({
  type: z.enum(APP_EVENT_TYPES).default("other"),
  screen: z.string().trim().max(120).optional(),
  tourId: objectId.optional(),
  // Free-form, bounded so a bad client can't push unbounded payloads.
  meta: z.record(z.unknown()).optional(),
});

// A single ping carries the device identity plus a batch of events, so the app
// can coalesce activity and fire one request instead of one per tap.
export const trackSchema = z.object({
  deviceId: z.string().trim().min(6).max(128),
  platform: z.enum(["android", "ios", "web"]).default("android"),
  appVersion: z.string().trim().max(40).optional(),
  deviceName: z.string().trim().max(80).optional(),
  events: z.array(eventSchema).max(50).default([]),
});
