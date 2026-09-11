import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { getMysqlPool } from "../pool.js";
import { mirrorImageToLegacy } from "../imageMirror.js";

type CountrySyncInput = {
  name: string;
  slug?: string | null;
  coverImage?: string | null;
  isActive: boolean;
  sortOrder: number;
  legacyMysqlId?: number | null;
};

// The live PHP admin (flyingdotcom/admin/countries.php) probes SHOW COLUMNS at
// runtime because the real column names vary between deployments — we do the
// same rather than hardcoding a guess. Cached per process once resolved.
type ResolvedColumns = { name: string; coverImage: string | null; isActive: string | null; hasSlug: boolean; hasSortOrder: boolean };
let cachedColumns: ResolvedColumns | null = null;

async function resolveColumns(): Promise<ResolvedColumns> {
  if (cachedColumns) return cachedColumns;

  const pool = getMysqlPool();
  if (!pool) throw new Error("MySQL sync is disabled");

  const [rows] = await pool.query<RowDataPacket[]>("SHOW COLUMNS FROM countries");
  const columnNames = new Set(rows.map((r) => r.Field as string));
  console.log("[mysql-sync] countries columns detected:", [...columnNames].join(", "));

  const pick = (...candidates: string[]) => candidates.find((c) => columnNames.has(c)) ?? null;

  cachedColumns = {
    name: pick("name", "title") ?? "name",
    coverImage: pick("cover_image", "image", "cover"),
    isActive: pick("is_active", "active", "status"),
    hasSlug: columnNames.has("slug"),
    hasSortOrder: columnNames.has("sort_order"),
  };
  return cachedColumns;
}

export async function syncCountryUpsert(country: CountrySyncInput): Promise<number | void> {
  const pool = getMysqlPool();
  if (!pool) return;

  const columns = await resolveColumns();

  const values: Record<string, unknown> = { [columns.name]: country.name };
  if (columns.hasSlug) values.slug = country.slug;
  if (columns.hasSortOrder) values.sort_order = country.sortOrder;
  if (columns.isActive) values[columns.isActive] = country.isActive ? 1 : 0;
  if (columns.coverImage && country.coverImage) {
    values[columns.coverImage] = await mirrorImageToLegacy("countries", country.coverImage);
  }

  if (country.legacyMysqlId) {
    await pool.query("UPDATE countries SET ? WHERE id = ?", [values, country.legacyMysqlId]);
    return country.legacyMysqlId;
  }

  const [result] = await pool.query<ResultSetHeader>("INSERT INTO countries SET ?", [values]);
  return result.insertId;
}

export async function syncCountryRemove(legacyMysqlId?: number): Promise<void> {
  const pool = getMysqlPool();
  if (!pool || !legacyMysqlId) return;
  await pool.query("DELETE FROM countries WHERE id = ?", [legacyMysqlId]);
}
