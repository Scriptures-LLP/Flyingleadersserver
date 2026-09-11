import type { ResultSetHeader } from "mysql2";

import { Tour } from "../../models/Tour.js";
import { getMysqlPool } from "../pool.js";

type PromoCodeSyncInput = {
  code: string;
  tourId?: string | null;
  type: "percent" | "amount";
  value: number;
  maxDiscount?: number | null;
  minCart?: number | null;
  usageLimit?: number | null;
  perUserLimit?: number | null;
  startsAt?: Date | null;
  expiresAt?: Date | null;
  isActive: boolean;
  note?: string | null;
  legacyMysqlId?: number | null;
};

/** 'Y-m-d H:i:s', matching flyingdotcom/inc/promo.php's expected format. */
function toMysqlDatetime(date?: Date | null): string | null {
  if (!date) return null;
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export async function syncPromoCodeUpsert(promo: PromoCodeSyncInput): Promise<number | void> {
  const pool = getMysqlPool();
  if (!pool) return;

  let legacyTourId: number | null = null;
  if (promo.tourId) {
    const tour = await Tour.findById(promo.tourId).select("legacyMysqlId").lean();
    if (!tour?.legacyMysqlId) throw new Error(`Referenced tour ${promo.tourId} is not yet synced to MySQL`);
    legacyTourId = tour.legacyMysqlId;
  }

  const values = {
    code: promo.code.toUpperCase(),
    tour_id: legacyTourId,
    type: promo.type,
    value: promo.value,
    max_discount: promo.maxDiscount ?? null,
    min_cart: promo.minCart ?? 0,
    usage_limit: promo.usageLimit ?? null,
    per_user_limit: promo.perUserLimit ?? null,
    starts_at: toMysqlDatetime(promo.startsAt),
    expires_at: toMysqlDatetime(promo.expiresAt),
    is_active: promo.isActive ? 1 : 0,
    note: promo.note ?? null,
  };

  if (promo.legacyMysqlId) {
    await pool.query("UPDATE promo_codes SET ? WHERE id = ?", [values, promo.legacyMysqlId]);
    return promo.legacyMysqlId;
  }

  const [result] = await pool.query<ResultSetHeader>("INSERT INTO promo_codes SET ?", [values]);
  return result.insertId;
}

export async function syncPromoCodeRemove(legacyMysqlId?: number): Promise<void> {
  const pool = getMysqlPool();
  if (!pool || !legacyMysqlId) return;
  await pool.query("DELETE FROM promo_codes WHERE id = ?", [legacyMysqlId]);
}
