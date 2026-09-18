import type { HydratedDocument } from "mongoose";

import { s3Adapter } from "../storage/s3Adapter.js";

/**
 * Returns the document as a plain object with a resolved public image URL added,
 * so the admin panel can render a thumbnail from the stored storage key.
 * `keyField` is the field holding the key (e.g. "image"/"file"/"coverImage");
 * `urlField` is the added field the panel reads (e.g. "imageUrl"/"url").
 */
export function withImageUrl(doc: HydratedDocument<any>, keyField: string, urlField: string) {
  const obj = doc.toObject();
  const key = obj[keyField] as string | undefined;
  return { ...obj, [urlField]: key ? s3Adapter.urlFor(key) : null };
}
