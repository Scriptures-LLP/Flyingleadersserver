import os from "node:os";

import multer from "multer";

import { ApiError } from "../utils/ApiError.js";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_FILE_SIZE_BYTES = 6 * 1024 * 1024; // 6MB, matches the PHP app's own limit

const storage = multer.diskStorage({
  destination: os.tmpdir(),
});

export const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      // Pass an ApiError (not a plain Error) so the error handler surfaces this
      // exact, user-facing message at 400 instead of a generic 500 "Internal
      // server error". Multer forwards whatever we give cb straight to next().
      cb(ApiError.badRequest(`Unsupported file type: ${file.mimetype}. Allowed: JPEG, PNG, WebP.`));
      return;
    }
    cb(null, true);
  },
});
