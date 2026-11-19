import type { ResultSetHeader } from "mysql2";

import { Airport } from "../../models/Airport.js";
import { Tour } from "../../models/Tour.js";
import { getMysqlPool } from "../pool.js";

type TourAirportPriceSyncInput = {
  tourId: { toString(): string };
  airportId: { toString(): string };
  addonPrice: number;
  appliesTo?: { adult?: boolean; child?: boolean; infant?: boolean } | null;
  isActive: boolean;
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

export async function syncTourAirportPriceUpsert(row: TourAirportPriceSyncInput): Promise<number | void> {
  const pool = getMysqlPool();
  if (!pool) return;

  const legacyTourId = await resolveTourLegacyId(row.tourId.toString());
  const legacyAirportId = await resolveAirportLegacyId(row.airportId.toString());
  const values = {
    tour_id: legacyTourId,
    airport_id: legacyAirportId,
    price: row.addonPrice,
    is_active: (row.isActive ?? true) ? 1 : 0,
    applies_to_adult: (row.appliesTo?.adult ?? true) ? 1 : 0,
    applies_to_child: (row.appliesTo?.child ?? true) ? 1 : 0,
    applies_to_infant: (row.appliesTo?.infant ?? true) ? 1 : 0,
  };

  if (row.legacyMysqlId) {
    await pool.query("UPDATE tour_airport_prices SET ? WHERE id = ?", [values, row.legacyMysqlId]);
    return row.legacyMysqlId;
  }

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO tour_airport_prices SET ?
     ON DUPLICATE KEY UPDATE price = VALUES(price), is_active = VALUES(is_active),
       applies_to_adult = VALUES(applies_to_adult), applies_to_child = VALUES(applies_to_child),
       applies_to_infant = VALUES(applies_to_infant)`,
    [values],
  );
  return result.insertId;
}

export async function syncTourAirportPriceRemove(legacyMysqlId?: number): Promise<void> {
  const pool = getMysqlPool();
  if (!pool || !legacyMysqlId) return;
  await pool.query("DELETE FROM tour_airport_prices WHERE id = ?", [legacyMysqlId]);
}
