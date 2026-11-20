import { Schema, model } from "mongoose";

// The in-app activity stream: one row per tracked user action (app open, screen
// view, tour view, search, booking start, …). This is what powers the app
// "user activity" analytics on the admin dashboard — session counts, screen
// popularity, daily activity series. It is deliberately append-only and
// schema-light (`meta` is free-form) so the app can start reporting new event
// types without a backend change.
//
// Raw events are high-volume and only interesting while recent, so the
// collection self-trims: a TTL index drops rows after 180 days. Longer-lived
// figures (total installs, lifetime viewers) come from AppDevice, which has no
// TTL — so expiring old events never distorts those.
const APP_EVENT_TTL_SECONDS = 180 * 24 * 60 * 60;

export const APP_EVENT_TYPES = [
  "app_open",
  "screen_view",
  "tour_view",
  "search",
  "wishlist_add",
  "booking_start",
  "booking_complete",
  "other",
] as const;
export type AppEventType = (typeof APP_EVENT_TYPES)[number];

const appEventSchema = new Schema(
  {
    deviceId: { type: String, required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", default: null, index: true },
    type: { type: String, enum: APP_EVENT_TYPES, default: "other", index: true },
    platform: { type: String, enum: ["android", "ios", "web"], default: "android" },
    // For screen_view/tour_view: the route or screen name (e.g. "home",
    // "explore", "tour/paris-escape"). Used to rank the most-viewed screens.
    screen: { type: String, trim: true },
    tourId: { type: Schema.Types.ObjectId, ref: "Tour", default: null },
    appVersion: { type: String, trim: true },
    // IST calendar day (YYYY-MM-DD) the event happened on, precomputed so the
    // daily activity series is a cheap group-by instead of a per-row timezone
    // conversion. Matches how the website traffic table keys its `day` column.
    day: { type: String, required: true, index: true },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

appEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: APP_EVENT_TTL_SECONDS });
// The dashboard's daily series and screen ranking both filter by type + day.
appEventSchema.index({ type: 1, day: 1 });

export const AppEvent = model("AppEvent", appEventSchema);
