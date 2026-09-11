import type { ResultSetHeader } from "mysql2";

import { getMysqlPool } from "../pool.js";
import { mirrorImageToLegacy } from "../imageMirror.js";

type GalleryImageSyncInput = {
  title?: string | null;
  altText?: string | null;
  file: string;
  kind: "tour" | "celebration";
  isFeatured: boolean;
  isActive: boolean;
  sortOrder: number;
  legacyMysqlId?: number | null;
};

export async function syncGalleryImageUpsert(image: GalleryImageSyncInput): Promise<number | void> {
  const pool = getMysqlPool();
  if (!pool) return;

  const values = {
    title: image.title ?? null,
    alt_text: image.altText ?? null,
    file: await mirrorImageToLegacy("gallery", image.file),
    kind: image.kind,
    is_featured: image.isFeatured ? 1 : 0,
    is_active: image.isActive ? 1 : 0,
    sort_order: image.sortOrder,
  };

  if (image.legacyMysqlId) {
    await pool.query("UPDATE gallery_images SET ? WHERE id = ?", [values, image.legacyMysqlId]);
    return image.legacyMysqlId;
  }

  const [result] = await pool.query<ResultSetHeader>("INSERT INTO gallery_images SET ?", [values]);
  return result.insertId;
}

export async function syncGalleryImageRemove(legacyMysqlId?: number): Promise<void> {
  const pool = getMysqlPool();
  if (!pool || !legacyMysqlId) return;
  await pool.query("DELETE FROM gallery_images WHERE id = ?", [legacyMysqlId]);
}
