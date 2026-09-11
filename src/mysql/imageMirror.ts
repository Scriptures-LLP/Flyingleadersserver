import { promises as fs } from "node:fs";
import path from "node:path";

import { env } from "../config/env.js";

type MirrorTarget = "tours" | "countries" | "covers" | "gallery";

/**
 * Where each entity's images live in the legacy flyingdotcom app, and how the
 * value gets stored in its MySQL column — see flyingdotcom's own
 * media_url()/country_img_url()/home_cover_url()/gallery_img_url() helpers.
 */
const MIRROR_TARGETS: Record<MirrorTarget, { destDir: string; legacyValue: (filename: string) => string }> = {
  tours: { destDir: "storage/tours", legacyValue: (f) => `tours/${f}` },
  countries: { destDir: "admin/uploads/countries", legacyValue: (f) => f },
  covers: { destDir: "admin/uploads/covers", legacyValue: (f) => f },
  gallery: { destDir: "admin/uploads/gallery", legacyValue: (f) => `uploads/gallery/${f}` },
};

/**
 * Copies a file we already stored (via localDiskAdapter, e.g. "tours/169...jpg")
 * into flyingdotcom's real storage layout, and returns the value to write into
 * the legacy MySQL column. Never touches PHP code — just places a file where
 * the existing PHP helpers already expect to find one.
 */
export async function mirrorImageToLegacy(target: MirrorTarget, ourStorageKey: string): Promise<string> {
  if (!env.FLYINGDOTCOM_STORAGE_ROOT) {
    throw new Error("FLYINGDOTCOM_STORAGE_ROOT is not configured — cannot mirror image to legacy site");
  }

  const filename = path.basename(ourStorageKey);
  const sourcePath = path.join(env.UPLOAD_ROOT, ourStorageKey);
  const config = MIRROR_TARGETS[target];
  const destDir = path.join(env.FLYINGDOTCOM_STORAGE_ROOT, config.destDir);

  await fs.mkdir(destDir, { recursive: true });
  await fs.copyFile(sourcePath, path.join(destDir, filename));

  return config.legacyValue(filename);
}
