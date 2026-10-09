/**
 * One-off: shrink images that were uploaded before s3Adapter started
 * optimizing uploads. Camera originals (2–3MB+, up to 2600×3467) were being
 * downloaded and decoded as-is by the app — ~24MB on the home screen alone,
 * which made Home / tour details slow and janky.
 *
 * For every stored image over SKIP_BELOW_BYTES, this downloads it, re-uploads
 * an optimized copy through s3Adapter.save (same resize + WebP as new uploads)
 * and points the record at the new key. Originals are NOT deleted, so any
 * record can be pointed back at its old key if needed.
 *
 *   npx tsx scripts/optimize-images.ts           # dry run: report only
 *   npx tsx scripts/optimize-images.ts --apply   # actually convert + update
 */
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Model } from "mongoose";

import { connectDB, disconnectDB } from "../src/config/db.js";
import { Category } from "../src/models/Category.js";
import { Country } from "../src/models/Country.js";
import { GalleryImage } from "../src/models/GalleryImage.js";
import { HomeCover } from "../src/models/HomeCover.js";
import { Tour } from "../src/models/Tour.js";
import { TourMedia } from "../src/models/TourMedia.js";
import { s3Adapter } from "../src/storage/s3Adapter.js";

const APPLY = process.argv.includes("--apply");
// Already-small images aren't worth a rewrite.
const SKIP_BELOW_BYTES = 250 * 1024;

// [model, field holding the storage key, folder new copies go into]
const TARGETS: [Model<any>, string, string][] = [
  [Tour, "coverImage", "tours"],
  [TourMedia, "file", "tourMedia"],
  [Category, "image", "categories"],
  [Country, "coverImage", "countries"],
  [HomeCover, "image", "covers"],
  [GalleryImage, "file", "gallery"],
];

function fmt(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

async function main() {
  await connectDB();
  console.log(APPLY ? "APPLY mode — records will be updated.\n" : "DRY RUN — nothing will be changed.\n");

  let before = 0;
  let after = 0;
  let converted = 0;

  for (const [model, field, folder] of TARGETS) {
    const docs = await model.find({ [field]: { $type: "string", $ne: "" } }).select(field).lean();
    for (const doc of docs as Record<string, any>[]) {
      const key = doc[field] as string;
      // Absolute URLs (legacy imports) may not live in our bucket; leave them.
      if (/^(https?:)?\/\//i.test(key) || key.toLowerCase().endsWith(".webp")) continue;

      const res = await fetch(s3Adapter.urlFor(key));
      if (!res.ok) {
        console.warn(`  ! ${model.modelName}.${field} ${doc._id}: download failed (${res.status})`);
        continue;
      }
      const original = Buffer.from(await res.arrayBuffer());
      if (original.length < SKIP_BELOW_BYTES) continue;

      before += original.length;
      if (!APPLY) {
        console.log(`  ${model.modelName}.${field} ${doc._id}: ${fmt(original.length)}  ${key}`);
        converted++;
        continue;
      }

      // s3Adapter.save takes a file path (it's built for multer uploads) and
      // removes it afterwards; it does the resize/WebP conversion itself.
      const ext = path.extname(key) || ".jpg";
      const tmp = path.join(os.tmpdir(), `optimize-${randomBytes(6).toString("hex")}${ext}`);
      await fs.writeFile(tmp, original);
      const stored = await s3Adapter.save(folder, tmp, `image${ext}`);
      const head = await fetch(stored.url, { method: "HEAD" });
      const newSize = Number(head.headers.get("content-length") ?? original.length);

      await model.updateOne({ _id: doc._id }, { $set: { [field]: stored.key } });
      after += newSize;
      converted++;
      console.log(`  ${model.modelName}.${field} ${doc._id}: ${fmt(original.length)} -> ${fmt(newSize)}  (old key kept: ${key})`);
    }
  }

  console.log(`\n${converted} image(s) ${APPLY ? "converted" : "would be converted"}, totalling ${fmt(before)}.`);
  if (APPLY) console.log(`Now ${fmt(after)} (saved ${fmt(before - after)}).`);
  else console.log("Re-run with --apply to convert them.");
  await disconnectDB();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDB().catch(() => undefined);
  process.exit(1);
});
