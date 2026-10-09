import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";

import { env } from "../config/env.js";
import type { StorageAdapter, StoredFile } from "./StorageAdapter.js";

const s3Client = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function keyPrefix(): string {
  const p = env.AWS_S3_KEY_PREFIX.replace(/^\/|\/$/g, "");
  return p ? `${p}/` : "";
}

function publicBase(): string {
  if (env.AWS_S3_PUBLIC_URL) return env.AWS_S3_PUBLIC_URL.replace(/\/$/, "");
  return `https://${env.AWS_BUCKET_NAME}.s3.${env.AWS_REGION}.amazonaws.com`;
}

// Admins upload camera originals (3MB+ is common), and the app downloaded them
// as-is — the main reason the tour details screen felt slow. No screen shows
// an image bigger than this on its longest side (portrait shots included), so
// anything larger is just wasted bytes.
const MAX_IMAGE_SIDE = 1440;

/**
 * Downsizes and re-encodes an uploaded photo as WebP (a 3.3MB camera original
 * comes out around 0.5MB). Anything that isn't a recognised image, or that sharp can't read,
 * is uploaded untouched rather than failing the upload.
 */
async function optimizeImage(original: Buffer, ext: string): Promise<{ body: Buffer; ext: string }> {
  if (!MIME_BY_EXT[ext]) return { body: original, ext };
  try {
    const body = await sharp(original)
      .rotate() // apply the EXIF orientation before it's stripped
      .resize({ width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
    // Already-small images can come out bigger; keep whichever is smaller.
    return body.length < original.length ? { body, ext: ".webp" } : { body: original, ext };
  } catch {
    return { body: original, ext };
  }
}

/**
 * S3-backed storage. Reads the multer tmp file into a buffer (avatars are capped
 * at 6MB), uploads it under `${prefix}/${folder}/<unique>.<ext>`, and returns the
 * stored key + public URL. Mirrors the cardude-server upload pattern.
 */
export const s3Adapter: StorageAdapter = {
  async save(folder, tmpFilePath, originalFilename) {
    if (!env.AWS_BUCKET_NAME) {
      throw new Error(
        "AWS_BUCKET_NAME is not set. If you just edited .env, fully restart the server — " +
          "`tsx watch` does not reload on .env changes.",
      );
    }
    const original = await fs.readFile(tmpFilePath);
    const { body, ext } = await optimizeImage(
      original,
      (path.extname(originalFilename) || ".jpg").toLowerCase(),
    );
    const filename = `${Date.now()}-${randomBytes(6).toString("hex")}${ext}`;
    const key = `${keyPrefix()}${folder}/${filename}`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: env.AWS_BUCKET_NAME,
        Key: key,
        Body: body,
        ContentType: MIME_BY_EXT[ext] ?? "application/octet-stream",
        // Every key is unique (timestamp + random), so a stored object never
        // changes — phones can cache it for good instead of re-downloading.
        CacheControl: "public, max-age=31536000, immutable",
        ...(env.AWS_S3_ACL ? { ACL: env.AWS_S3_ACL as "public-read" } : {}),
      }),
    );

    await fs.unlink(tmpFilePath).catch(() => undefined);
    return { key, url: this.urlFor(key) };
  },

  async remove(key) {
    await s3Client
      .send(new DeleteObjectCommand({ Bucket: env.AWS_BUCKET_NAME, Key: key }))
      .catch(() => undefined);
  },

  urlFor(key) {
    if (!key) return key;
    // Some records (legacy imports / manual entries / older upload flows) store
    // a full URL rather than a bare storage key. Prefixing the public base onto
    // those produces a broken "https://base/https://…" URL — so pass absolute
    // URLs (and protocol-relative ones) through unchanged.
    if (/^(https?:)?\/\//i.test(key)) return key;
    // Tolerate an accidental leading slash on the stored key.
    return `${publicBase()}/${key.replace(/^\/+/, "")}`;
  },
} satisfies StorageAdapter;

export type { StoredFile };
