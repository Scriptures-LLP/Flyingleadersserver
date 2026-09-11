import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { env } from "../config/env.js";
import type { StorageAdapter, StoredFile } from "./StorageAdapter.js";

function extOf(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return ext || "";
}

export const localDiskAdapter: StorageAdapter = {
  async save(folder, tmpFilePath, originalFilename) {
    const dir = path.join(env.UPLOAD_ROOT, folder);
    await fs.mkdir(dir, { recursive: true });

    const filename = `${Date.now()}-${randomBytes(6).toString("hex")}${extOf(originalFilename)}`;
    const destPath = path.join(dir, filename);

    await fs.rename(tmpFilePath, destPath).catch(async (err) => {
      // rename can fail across devices/tmp mounts — fall back to copy+unlink
      if (err.code === "EXDEV") {
        await fs.copyFile(tmpFilePath, destPath);
        await fs.unlink(tmpFilePath);
        return;
      }
      throw err;
    });

    const key = `${folder}/${filename}`;
    return { key, url: this.urlFor(key) };
  },

  async remove(key) {
    const filePath = path.join(env.UPLOAD_ROOT, key);
    await fs.unlink(filePath).catch((err) => {
      if (err.code !== "ENOENT") throw err;
    });
  },

  urlFor(key) {
    return `${env.PUBLIC_UPLOAD_BASE_URL.replace(/\/$/, "")}/${key}`;
  },
} satisfies StorageAdapter;

export type { StoredFile };
