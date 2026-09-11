import type { ResultSetHeader } from "mysql2";

import { Airport } from "../../models/Airport.js";
import { Tour } from "../../models/Tour.js";
import { getMysqlPool } from "../pool.js";

type TourDateSyncInput = {
  tourId: string;
  airportId?: string | null;
  date: Date;
  price: number;
  label?: string | null;
  isActive: boolean;
  sortOrder?: number;
  legacyMysqlId?: number | null;
};

async function resolveTourLegacyId(id: string): Promise<number> {
  const doc = await Tour.findById(id).select("legacyMysqlId").lean();
  if (!doc?.legacyMysqlId) throw new Error(`Referenced tour ${id} is not yet synced to MySQL`);
  return doc.legacyMysqlId;
}

async function resolveAirportLegacyId(id: string): Promise<number> {
  const doc = await Airport.findById(id).select("legacyMysqlId").lean();
  if (!doc?.legacyMysqlId) throw new Error(`Referenced airport ${id} is not yet synced to MySQL`);
  return doc.legacyMysqlId;
}

// airportId set -> legacy `tour_airport_custom_dates` (the primary, real mechanism)
// airportId null -> legacy `tour_travel_dates` (a global fallback, not airport-specific)
export async function syncTourDateUpsert(tourDate: TourDateSyncInput): Promise<number | void> {
  const pool = getMysqlPool();
  if (!pool) return;

  const legacyTourId = await resolveTourLegacyId(tourDate.tourId);
  const dateStr = tourDate.date.toISOString().slice(0, 10);

  if (tourDate.airportId) {
    const legacyAirportId = await resolveAirportLegacyId(tourDate.airportId);
    const values = {
      tour_id: legacyTourId,
      airport_id: legacyAirportId,
      travel_date: dateStr,
      price: tourDate.price,
      is_active: tourDate.isActive ? 1 : 0,
    };
    if (tourDate.legacyMysqlId) {
      await pool.query("UPDATE tour_airport_custom_dates SET ? WHERE id = ?", [values, tourDate.legacyMysqlId]);
      return tourDate.legacyMysqlId;
    }
    const [result] = await pool.query<ResultSetHeader>(
      "INSERT INTO tour_airport_custom_dates SET ? ON DUPLICATE KEY UPDATE price = VALUES(price), is_active = VALUES(is_active)",
      [values],
    );
    return result.insertId;
  }

  const values = {
    tour_id: legacyTourId,
    travel_date: dateStr,
    label: tourDate.label ?? null,
    price: tourDate.price,
    is_active: tourDate.isActive ? 1 : 0,
    sort_order: tourDate.sortOrder ?? 0,
  };
  if (tourDate.legacyMysqlId) {
    await pool.query("UPDATE tour_travel_dates SET ? WHERE id = ?", [values, tourDate.legacyMysqlId]);
    return tourDate.legacyMysqlId;
  }
  const [result] = await pool.query<ResultSetHeader>("INSERT INTO tour_travel_dates SET ?", [values]);
  return result.insertId;
}

export async function syncTourDateRemove(legacySourceTable: string, legacyMysqlId?: number): Promise<void> {
  const pool = getMysqlPool();
  if (!pool || !legacyMysqlId) return;
  const table = legacySourceTable === "tour_travel_dates" ? "tour_travel_dates" : "tour_airport_custom_dates";
  await pool.query(`DELETE FROM ${table} WHERE id = ?`, [legacyMysqlId]);
}
