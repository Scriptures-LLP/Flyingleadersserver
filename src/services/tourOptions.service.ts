import type { Types } from "mongoose";

import { Airport } from "../models/Airport.js";
import { TourAirportPrice } from "../models/TourAirportPrice.js";
import { TourDate } from "../models/TourDate.js";

export type TourAirportOption = { id: string; code: string; name: string; addonPrice: number };

/**
 * The departure airports a tour can be booked from, with each airport's own
 * add-on price. Deliberately independent of the tour's date prices: this is
 * the "Tour Airport Prices" list and nothing else contributes a price here.
 *
 * Mirrors the live website's airport list (tour_airport_prices UNION airports
 * that have active mapped dates):
 *  - an airport with an active price row is offered at that row's add-on;
 *  - an airport that only appears on active dates is offered at ₹0;
 *  - an airport whose price row is switched off is not offered at all, even
 *    if dates still reference it — the admin's explicit off-switch wins;
 *  - inactive airports never appear.
 */
export async function listTourAirports(tourId: Types.ObjectId | string): Promise<TourAirportOption[]> {
  const [priceRows, datedAirportIds] = await Promise.all([
    TourAirportPrice.find({ tourId }).lean(),
    TourDate.distinct("airportId", {
      tourId,
      isActive: true,
      airportId: { $ne: null },
      date: { $gte: new Date() },
    }),
  ]);

  const switchedOff = new Set(priceRows.filter((r) => !r.isActive).map((r) => String(r.airportId)));
  const addonByAirport = new Map(
    priceRows.filter((r) => r.isActive).map((r) => [String(r.airportId), r.addonPrice ?? 0] as const),
  );

  const ids = new Set([...addonByAirport.keys(), ...datedAirportIds.map(String)]);
  for (const id of switchedOff) ids.delete(id);
  if (ids.size === 0) return [];

  const airports = await Airport.find({ _id: { $in: [...ids] }, isActive: true }).sort({ name: 1 });
  return airports.map((a) => ({
    id: a.id as string,
    code: a.code,
    name: a.name,
    addonPrice: addonByAirport.get(a.id as string) ?? 0,
  }));
}
