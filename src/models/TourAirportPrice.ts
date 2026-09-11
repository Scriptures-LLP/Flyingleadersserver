import { Schema, model } from "mongoose";

import { mysqlSyncFields } from "./shared/mysqlSyncFields.js";

// Mirrors legacy `tour_airport_prices` — a per-(tour,airport) price add-on.
// Nothing in the legacy PHP admin ever wrote to this table; ours is the first
// real management UI for it.
const tourAirportPriceSchema = new Schema(
  {
    ...mysqlSyncFields,

    tourId: { type: Schema.Types.ObjectId, ref: "Tour", required: true },
    airportId: { type: Schema.Types.ObjectId, ref: "Airport", required: true },
    addonPrice: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

tourAirportPriceSchema.index({ tourId: 1, airportId: 1 }, { unique: true });

export const TourAirportPrice = model("TourAirportPrice", tourAirportPriceSchema);
