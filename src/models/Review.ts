import { Schema, model } from "mongoose";

const reviewSchema = new Schema(
  {
    tourId: { type: Schema.Types.ObjectId, ref: "Tour", required: true, index: true },
    bookingId: { type: Schema.Types.ObjectId, ref: "Booking", required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },

    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, trim: true },
    comment: { type: String, trim: true, required: true },
    photos: { type: [String], default: [] },

    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    moderatedBy: { type: Schema.Types.ObjectId, ref: "AdminUser" },
    moderatedAt: { type: Date },
    moderationNote: { type: String, trim: true },
  },
  { timestamps: true },
);

// One review per booking per tour — a customer can't spam multiple reviews
// for the same trip.
reviewSchema.index({ bookingId: 1, tourId: 1 }, { unique: true });

export const Review = model("Review", reviewSchema);
