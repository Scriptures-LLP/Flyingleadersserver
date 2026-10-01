import { s3Adapter } from "../storage/s3Adapter.js";

type MirrorTarget = "tours" | "countries" | "covers" | "gallery";

/**
 * Returns the public S3 URL for an image we already stored via s3Adapter, to
 * be written directly into the legacy MySQL column. flyingdotcom's own
 * media_url()/country_img_url()/home_cover_url()/gallery_img_url() helpers
 * (flyingdotcom/*.php) pass an absolute http(s) URL through unchanged, so S3
 * stays the single copy of every image — nothing is ever placed on a local
 * disk or mirrored onto Hostinger's filesystem.
 */
export function mirrorImageToLegacy(_target: MirrorTarget, ourStorageKey: string): string {
  return s3Adapter.urlFor(ourStorageKey);
}
