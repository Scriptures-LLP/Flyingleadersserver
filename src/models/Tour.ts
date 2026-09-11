import { Schema, model } from "mongoose";

import { mysqlSyncFields } from "./shared/mysqlSyncFields.js";
import { uniqueSlug } from "../utils/slug.js";

const tourSchema = new Schema(
  {
    ...mysqlSyncFields,

    title: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, sparse: true },
    shortDesc: { type: String, trim: true },
    fullDesc: { type: String },
    location: { type: String, trim: true },
    duration: { type: String, trim: true },
    countryId: { type: Schema.Types.ObjectId, ref: "Country" },
    // References Category.slug rather than its ObjectId, matching the app's
    // existing TourPackage.category field (a plain string like "beach").
    category: { type: String, trim: true },

    price: { type: Number, required: true, min: 0 },
    priceChild: { type: Number, min: 0 },
    priceInfant: { type: Number, min: 0 },
    tokenAmount: { type: Number, min: 0, default: 0 },
    allowTokenPayment: { type: Boolean, default: false },

    coverImage: { type: String },

    itinerary: { type: String },
    inclusions: { type: String },
    exclusions: { type: String },
    flightDetails: { type: String },
    showFlightDetails: { type: Boolean, default: false },
    hotelDetails: { type: String },
    showHotelDetails: { type: Boolean, default: false },

    totalSeats: { type: Number, min: 0 },
    seatsAvailable: { type: Number, min: 0 },
    seatsRemark: {
      type: String,
      enum: ["Available", "Fast Selling", "Almost Sold Out", "Hot Selling", "Sold Out"],
      default: "Available",
    },

    rating: { type: Number, min: 0, max: 5, default: 4.5 },
    groupSizeLabel: { type: String, trim: true },
    hotelClassLabel: { type: String, trim: true },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

tourSchema.index({ isActive: 1, category: 1 });
tourSchema.index({ isActive: 1, countryId: 1 });

tourSchema.pre("validate", async function () {
  if (!this.slug) {
    this.slug = await uniqueSlug(Tour, this.title, this.isNew ? undefined : this.id);
  }
});

export const Tour = model("Tour", tourSchema);
