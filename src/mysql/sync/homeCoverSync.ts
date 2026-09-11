import type { ResultSetHeader } from "mysql2";

import { getMysqlPool } from "../pool.js";
import { mirrorImageToLegacy } from "../imageMirror.js";

type HomeCoverSyncInput = {
  image: string;
  title?: string | null;
  isActive: boolean;
  sortOrder: number;
  legacyMysqlId?: number | null;
};

export async function syncHomeCoverUpsert(cover: HomeCoverSyncInput): Promise<number | void> {
  const pool = getMysqlPool();
  if (!pool) return;

  const values = {
    image: await mirrorImageToLegacy("covers", cover.image),
    title: cover.title ?? null,
    is_active: cover.isActive ? 1 : 0,
    sort_order: cover.sortOrder,
  };

  if (cover.legacyMysqlId) {
    await pool.query("UPDATE home_covers SET ? WHERE id = ?", [values, cover.legacyMysqlId]);
    return cover.legacyMysqlId;
  }

  const [result] = await pool.query<ResultSetHeader>("INSERT INTO home_covers SET ?", [values]);
  return result.insertId;
}

export async function syncHomeCoverRemove(legacyMysqlId?: number): Promise<void> {
  const pool = getMysqlPool();
  if (!pool || !legacyMysqlId) return;
  await pool.query("DELETE FROM home_covers WHERE id = ?", [legacyMysqlId]);
}
