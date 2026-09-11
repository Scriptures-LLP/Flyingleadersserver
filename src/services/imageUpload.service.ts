import type { Request } from "express";

import { localDiskAdapter } from "../storage/localDiskAdapter.js";

/**
 * If a file was uploaded (req.file, via multer's .single(fieldName)), stores it under `folder`,
 * sets `updates[fieldName]` to the new storage key, and cleans up the previous file if any.
 * No-op if no file was uploaded on this request (i.e. the field is left unchanged).
 */
export async function attachUploadedImage(
  req: Request,
  folder: string,
  updates: Record<string, unknown>,
  fieldName: string,
  previousKey?: string | null,
) {
  if (!req.file) return;
  const stored = await localDiskAdapter.save(folder, req.file.path, req.file.originalname);
  updates[fieldName] = stored.key;
  if (previousKey) await localDiskAdapter.remove(previousKey).catch(() => undefined);
}
