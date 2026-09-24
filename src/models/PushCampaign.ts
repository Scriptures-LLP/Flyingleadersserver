import { Schema, model } from "mongoose";

// A notification the admin sent from the panel (an offer, a reminder, an
// announcement) — kept as a history of what went out, to whom, and how many
// phones it reached.
const pushCampaignSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    category: { type: String, enum: ["promotions", "bookingUpdates", "tripReminders"], required: true },
    audience: {
      type: { type: String, required: true },
      tourId: { type: Schema.Types.ObjectId, ref: "Tour" },
      customerId: { type: Schema.Types.ObjectId, ref: "Customer" },
      days: { type: Number },
    },
    data: { type: Schema.Types.Mixed },
    stats: {
      audience: { type: Number, default: 0 }, // customers matching the audience
      recipients: { type: Number, default: 0 }, // …who hadn't switched this kind off
      devices: { type: Number, default: 0 }, // phones we tried to push to
      sent: { type: Number, default: 0 }, // accepted by Expo for delivery
      failed: { type: Number, default: 0 },
    },
    sentBy: { type: Schema.Types.ObjectId, ref: "AdminUser" },
  },
  { timestamps: true },
);

export const PushCampaign = model("PushCampaign", pushCampaignSchema);
