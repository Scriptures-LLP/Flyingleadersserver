import type { ResultSetHeader } from "mysql2";

import { getMysqlPool } from "../pool.js";

type AirportSyncInput = {
  code: string;
  name: string;
  isActive: boolean;
  legacyMysqlId?: number | null;
};

export async function syncAirportUpsert(airport: AirportSyncInput): Promise<number | void> {
  const pool = getMysqlPool();
  if (!pool) return;

  const values = {
    code: airport.code,
    name: airport.name,
    is_active: airport.isActive ? 1 : 0,
  };

  if (airport.legacyMysqlId) {
    await pool.query("UPDATE airports SET ? WHERE id = ?", [values, airport.legacyMysqlId]);
    return airport.legacyMysqlId;
  }

  const [result] = await pool.query<ResultSetHeader>("INSERT INTO airports SET ?", [values]);
  return result.insertId;
}

export async function syncAirportRemove(legacyMysqlId?: number): Promise<void> {
  const pool = getMysqlPool();
  if (!pool || !legacyMysqlId) return;
  await pool.query("DELETE FROM airports WHERE id = ?", [legacyMysqlId]);
}
