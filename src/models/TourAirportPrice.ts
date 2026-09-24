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
    // Optional — an airport can be added to a tour with no charge yet. When it
    // has one, it is folded into the per-person price of the traveller types
    // ticked in appliesTo (Adult / Child / Infant) — never shown separately.
    // Defaults to all three, which is how every row created before categories
    // existed behaved. (The legacy MySQL table has no category column, so the
    // optional sync — currently off — can only send the flat amount.)
    addonPrice: { type: Number, min: 0, default: 0 },
    appliesTo: {
      adult: { type: Boolean, default: true },
      child: { type: Boolean, default: true },
      infant: { type: Boolean, default: true },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

tourAirportPriceSchema.index({ tourId: 1, airportId: 1 }, { unique: true });

export const TourAirportPrice = model("TourAirportPrice", tourAirportPriceSchema);
