import type { ResultSetHeader } from "mysql2";

import { Country } from "../../models/Country.js";
import { getMysqlPool } from "../pool.js";
import { mirrorImageToLegacy } from "../imageMirror.js";

type TourSyncInput = {
  title: string;
  slug?: string | null;
  shortDesc?: string | null;
  fullDesc?: string | null;
  location?: string | null;
  duration?: string | null;
  countryId?: { toString(): string } | null;
  price: number;
  priceChild?: number | null;
  priceInfant?: number | null;
  tokenAmount?: number | null;
  allowTokenPayment?: boolean;
  coverImage?: string | null;
  itinerary?: string | null;
  inclusions?: string | null;
  exclusions?: string | null;
  flightDetails?: string | null;
  showFlightDetails?: boolean;
  hotelDetails?: string | null;
  showHotelDetails?: boolean;
  totalSeats?: number | null;
  seatsAvailable?: number | null;
  seatsRemark?: string | null;
  isActive: boolean;
  legacyMysqlId?: number | null;
};

export async function syncTourUpsert(tour: TourSyncInput): Promise<number | void> {
  const pool = getMysqlPool();
  if (!pool) return;

  let legacyCountryId: number | null = null;
  if (tour.countryId) {
    const countryId = tour.countryId.toString();
    const country = await Country.findById(countryId).select("legacyMysqlId").lean();
    if (country?.legacyMysqlId) {
      legacyCountryId = country.legacyMysqlId;
    } else {
      throw new Error(`Referenced country ${countryId} is not yet synced to MySQL`);
    }
  }

  const values: Record<string, unknown> = {
    title: tour.title,
    slug: tour.slug,
    short_desc: tour.shortDesc ?? null,
    full_desc: tour.fullDesc ?? null,
    location: tour.location ?? null,
    duration: tour.duration ?? null,
    country_id: legacyCountryId,
    price: tour.price,
    price_child: tour.priceChild ?? null,
    price_infant: tour.priceInfant ?? null,
    // Legacy has no separate "allow token payment" flag — 0 implicitly means disabled.
    token_amount: tour.allowTokenPayment ? (tour.tokenAmount ?? 0) : 0,
    itinerary: tour.itinerary ?? null,
    inclusions: tour.inclusions ?? null,
    exclusions: tour.exclusions ?? null,
    flight_details: tour.flightDetails ?? null,
    show_flight_details: tour.showFlightDetails ? 1 : 0,
    hotel_details: tour.hotelDetails ?? null,
    show_hotel_details: tour.showHotelDetails ? 1 : 0,
    total_seats: tour.totalSeats ?? null,
    seats_available: tour.seatsAvailable ?? null,
    seats_remark: tour.seatsRemark ?? null,
    is_active: tour.isActive ? 1 : 0,
  };

  if (tour.coverImage) {
    values.image = await mirrorImageToLegacy("tours", tour.coverImage);
  }

  if (tour.legacyMysqlId) {
    await pool.query("UPDATE tours SET ? WHERE id = ?", [values, tour.legacyMysqlId]);
    return tour.legacyMysqlId;
  }

  const [result] = await pool.query<ResultSetHeader>("INSERT INTO tours SET ?", [values]);
  return result.insertId;
}

export async function syncTourRemove(legacyMysqlId?: number): Promise<void> {
  const pool = getMysqlPool();
  if (!pool || !legacyMysqlId) return;
  await pool.query("DELETE FROM tours WHERE id = ?", [legacyMysqlId]);
}
