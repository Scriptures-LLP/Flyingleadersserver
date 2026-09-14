import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

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
    const ext = (path.extname(originalFilename) || ".jpg").toLowerCase();
    const filename = `${Date.now()}-${randomBytes(6).toString("hex")}${ext}`;
    const key = `${keyPrefix()}${folder}/${filename}`;

    const body = await fs.readFile(tmpFilePath);
    await s3Client.send(
      new PutObjectCommand({
        Bucket: env.AWS_BUCKET_NAME,
        Key: key,
        Body: body,
        ContentType: MIME_BY_EXT[ext] ?? "application/octet-stream",
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
    return `${publicBase()}/${key}`;
  },
} satisfies StorageAdapter;

export type { StoredFile };
