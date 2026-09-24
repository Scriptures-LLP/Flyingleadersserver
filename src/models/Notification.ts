import { Schema, model } from "mongoose";

// A customer's inbox entry — what the bell in the app lists. Written for every
// notification that reaches a customer (offers from the admin, payment
// confirmations, referral rewards), whether or not their phone could also be
// pushed to, so nothing is lost if a push is swiped away or notifications are
// off at the OS level.
const notificationSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    // Matches the customer's notification preferences: which switch governs it.
    category: { type: String, enum: ["promotions", "bookingUpdates", "tripReminders"], required: true },
    // Where tapping it goes: { screen: "booking" | "tour" | "referral" | "trips" | "home", bookingId?, tourSlug? }
    data: { type: Schema.Types.Mixed },
    campaignId: { type: Schema.Types.ObjectId, ref: "PushCampaign" },
    readAt: { type: Date },
  },
  { timestamps: true },
);

notificationSchema.index({ customerId: 1, createdAt: -1 });

export const Notification = model("Notification", notificationSchema);
