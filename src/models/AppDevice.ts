import { Schema, model } from "mongoose";

// One row per app install. Unlike PushToken (which only exists once a device
// opts into notifications), an AppDevice is created the first time the app
// pings analytics — so the row count is our best proxy for total installs /
// "downloads", and `firstSeenAt` lets us count NEW installs in a date range.
// `lastSeenAt` powers the "active viewers" figure (devices that opened the app
// within the range). The deviceId is an anonymous, app-generated id persisted
// on the phone; it is NOT tied to login, so one person across sign-in/sign-out
// stays one device.
const appDeviceSchema = new Schema(
  {
    deviceId: { type: String, required: true, unique: true },
    platform: { type: String, enum: ["android", "ios", "web"], default: "android", index: true },
    appVersion: { type: String, trim: true },
    deviceName: { type: String, trim: true },
    // Set once the device is signed in, so we can tell logged-in vs guest usage.
    // Points at whoever was last signed in on this phone.
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", default: null, index: true },
    // Install moment (download proxy) and most-recent activity (active viewer).
    firstSeenAt: { type: Date, default: Date.now, index: true },
    lastSeenAt: { type: Date, default: Date.now, index: true },
    // Total app-open sessions this device has reported.
    sessions: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const AppDevice = model("AppDevice", appDeviceSchema);
