import { getMysqlPool } from "../pool.js";

type SettingSyncInput = { key: string; value: string };

// Legacy `settings` table's PK is the key itself (`k`), not an auto-increment
// id, so this is a plain upsert — no legacyMysqlId bookkeeping needed.
export async function syncSettingUpsert(setting: SettingSyncInput): Promise<void> {
  const pool = getMysqlPool();
  if (!pool) return;

  await pool.query("INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)", [
    setting.key,
    setting.value,
  ]);
}
