import os from "node:os";

import multer from "multer";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_SIZE_BYTES = 6 * 1024 * 1024; // 6MB, matches the PHP app's own limit

const storage = multer.diskStorage({
  destination: os.tmpdir(),
});

export const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: jpeg, png, webp.`));
      return;
    }
    cb(null, true);
  },
});
