import { Schema, model } from "mongoose";

// One row per app install that can receive push notifications. The token is the
// identity: signing in as someone else on the same phone re-points the row at
// the new customer, so a device never keeps receiving the previous person's
// notifications.
const pushTokenSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    token: { type: String, required: true, unique: true },
    platform: { type: String, enum: ["android", "ios"], default: "android" },
    deviceName: { type: String, trim: true },
    // Switched off when Expo reports the device is gone (app uninstalled, token
    // revoked) so it's never sent to again.
    isActive: { type: Boolean, default: true },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export const PushToken = model("PushToken", pushTokenSchema);
