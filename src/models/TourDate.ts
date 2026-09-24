import { Schema, model } from "mongoose";

import { mysqlSyncFields } from "./shared/mysqlSyncFields.js";

// Merges the legacy app's two overlapping date-pricing tables into one clean
// concept: airportId set = mirrors `tour_airport_custom_dates` (the primary,
// airport-specific mechanism); airportId null = mirrors `tour_travel_dates`
// (a global fallback that applies to any airport).
const tourDateSchema = new Schema(
  {
    ...mysqlSyncFields,

    tourId: { type: Schema.Types.ObjectId, ref: "Tour", required: true },
    airportId: { type: Schema.Types.ObjectId, ref: "Airport", default: null },
    date: { type: Date, required: true },
    // Optional — a date can exist purely to be selectable, with no charge at
    // all. When it does have one (the "travel charge"), appliesTo controls
    // which traveller types it's folded into the price of (defaults to all
    // three) — it is never shown to the customer as a separate line.
    price: { type: Number, min: 0, default: 0 },
    appliesTo: {
      adult: { type: Boolean, default: true },
      child: { type: Boolean, default: true },
      infant: { type: Boolean, default: true },
    },
    label: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    legacySourceTable: {
      type: String,
      enum: ["tour_airport_custom_dates", "tour_travel_dates"],
    },
  },
  { timestamps: true },
);

tourDateSchema.index({ tourId: 1, airportId: 1, date: 1 }, { unique: true });

tourDateSchema.pre("validate", function () {
  if (!this.legacySourceTable) {
    this.legacySourceTable = this.airportId ? "tour_airport_custom_dates" : "tour_travel_dates";
  }
});

export const TourDate = model("TourDate", tourDateSchema);
