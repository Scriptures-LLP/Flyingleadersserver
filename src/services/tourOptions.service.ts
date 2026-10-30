import type { Types } from "mongoose";

import { Airport } from "../models/Airport.js";
import { TourAirportPrice } from "../models/TourAirportPrice.js";
import { TourDate } from "../models/TourDate.js";

export type ChargeCategories = { adult: boolean; child: boolean; infant: boolean };
export type TourAirportOption = {
  id: string;
  code: string;
  name: string;
  /** The airport charge — internal: it is folded into per-type prices, never sent to customers. */
  addonPrice: number;
  /** Which traveller types that charge is added to. */
  appliesTo: ChargeCategories;
};

/**
 * The departure airports a tour can be booked from, with each airport's own
 * add-on price. Deliberately independent of the tour's date prices: this is
 * the "Tour Airport Prices" list and nothing else contributes a price here.
 *
 * Mirrors the live website's airport list (tour_airport_prices UNION airports
 * that have active mapped dates):
 *  - an airport with an active price row is offered at that row's add-on;
 *  - an airport that only appears on active dates is offered at ₹0;
 *  - an airport whose price row is switched off, but which still has its own
 *    active dates, stays offered at ₹0 — Tour Dates and Tour Airport Prices
 *    are independent switches, so turning one off must never silently hide
 *    the other;
 *  - an airport whose price row is switched off AND has no dates of its own
 *    is not offered at all;
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
  const activeRows = priceRows.filter((r) => r.isActive);
  const addonByAirport = new Map(activeRows.map((r) => [String(r.airportId), r.addonPrice ?? 0] as const));
  // Rows saved before categories existed have no appliesTo: they applied to everyone.
  const categoriesByAirport = new Map(
    activeRows.map(
      (r) =>
        [
          String(r.airportId),
          { adult: r.appliesTo?.adult ?? true, child: r.appliesTo?.child ?? true, infant: r.appliesTo?.infant ?? true },
        ] as const,
    ),
  );

  const datedIds = new Set(datedAirportIds.map(String));
  const ids = new Set([...addonByAirport.keys(), ...datedIds]);
  for (const id of switchedOff) {
    if (!datedIds.has(id)) ids.delete(id);
  }
  if (ids.size === 0) return [];

  const airports = await Airport.find({ _id: { $in: [...ids] }, isActive: true }).sort({ name: 1 });
  return airports.map((a) => ({
    id: a.id as string,
    code: a.code,
    name: a.name,
    addonPrice: addonByAirport.get(a.id as string) ?? 0,
    appliesTo: categoriesByAirport.get(a.id as string) ?? { adult: true, child: true, infant: true },
  }));
}

export type TourDateItem = {
  id: string;
  date: Date;
  label: string | null;
  airport: { _id: string; code: string; name: string } | null;
  /** Seats remaining for this date; null when the admin hasn't set a count. */
  seatsAvailable: number | null;
};

/**
 * The departure dates a tour can actually be booked on: active, in the future,
 * and — when a date is tied to one airport — only if that airport is still
 * offered (a date tied to a deactivated or deleted Airport is dropped rather
 * than silently turning into an "any airport" date; its Tour Airport Price
 * row being switched off does NOT drop it — see listTourAirports).
 *
 * The one definition of "bookable date": the public dates list and booking
 * validation both use it, so they can never disagree.
 */
// India-time day key for a stored date — matches the app's own `dayKey`, so a
// UTC-midnight and an IST-midnight instant land on the same calendar day.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const istDayKey = (d: Date) => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

/**
 * The seats remaining on each tour's NEXT upcoming departure day, for a batch of
 * tours at once (so the package-card list doesn't fire one query per card).
 *
 * The figure mirrors the app's `daySeats`: a day can hold several (date, airport)
 * rows, and the day is bookable while any row still has room, so we take the max
 * of the tracked rows on that earliest day. `null` = that date tracks no seats
 * (nothing to show); `0` = sold out.
 */
export async function nearestDateSeatsByTour(
  tourIds: (Types.ObjectId | string)[],
): Promise<Map<string, number | null>> {
  const result = new Map<string, number | null>();
  if (tourIds.length === 0) return result;

  const dates = await TourDate.find({
    tourId: { $in: tourIds },
    isActive: true,
    date: { $gte: new Date() },
  })
    .sort({ date: 1, sortOrder: 1 })
    .lean();

  // Dates arrive ascending, so the first row seen per tour fixes its earliest
  // day; later rows only count while they're still on that same day.
  const earliestDayByTour = new Map<string, string>();
  const tracked = new Map<string, number[]>();
  for (const d of dates) {
    const tid = String(d.tourId);
    const day = istDayKey(d.date);
    const earliest = earliestDayByTour.get(tid);
    if (earliest === undefined) earliestDayByTour.set(tid, day);
    else if (day !== earliest) continue;
    if (typeof d.seatsAvailable === "number") {
      tracked.set(tid, [...(tracked.get(tid) ?? []), d.seatsAvailable]);
    }
  }
  for (const tid of earliestDayByTour.keys()) {
    const seats = tracked.get(tid);
    result.set(tid, seats && seats.length > 0 ? Math.max(...seats) : null);
  }
  return result;
}

export async function listTourDates(
  tourId: Types.ObjectId | string,
  airports?: TourAirportOption[],
): Promise<TourDateItem[]> {
  const [dates, offered] = await Promise.all([
    TourDate.find({ tourId, isActive: true, date: { $gte: new Date() } })
      .sort({ date: 1, sortOrder: 1 })
      .lean(),
    airports ? Promise.resolve(airports) : listTourAirports(tourId),
  ]);
  const airportById = new Map(offered.map((a) => [a.id, a]));

  const items: TourDateItem[] = [];
  for (const d of dates) {
    const base = {
      id: String(d._id),
      date: d.date,
      label: d.label ?? null,
      seatsAvailable: typeof d.seatsAvailable === "number" ? d.seatsAvailable : null,
    };
    if (!d.airportId) {
      items.push({ ...base, airport: null });
      continue;
    }
    const a = airportById.get(String(d.airportId));
    if (a) items.push({ ...base, airport: { _id: a.id, code: a.code, name: a.name } });
  }
  return items;
}
