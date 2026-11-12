import type { NextFunction, Request, Response } from "express";
import { MongoServerError } from "mongodb";
import mongoose from "mongoose";
import multer from "multer";

import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { MAX_FILE_SIZE_BYTES } from "./upload.middleware.js";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { message: `No route: ${req.method} ${req.originalUrl}` } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ error: { message: err.message, details: err.details } });
    return;
  }

  if (err instanceof mongoose.Error.ValidationError) {
    res.status(400).json({ error: { message: "Validation failed", details: err.errors } });
    return;
  }

  if (err instanceof MongoServerError && err.code === 11000) {
    res.status(409).json({ error: { message: "Duplicate value", details: err.keyValue } });
    return;
  }

  // Multer rejects (file too large, wrong field, too many files, …) are the
  // caller's mistake, not a server fault — answer 400 with a clear message
  // instead of a generic 500 "Internal server error".
  if (err instanceof multer.MulterError) {
    const sizeMb = Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024));
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? `File too large. Each image must be ${sizeMb}MB or less.`
        : err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE"
          ? "Too many files, or an unexpected file field was sent."
          : err.message;
    res.status(400).json({ error: { message } });
    return;
  }

  console.error(err);
  // Outside production, surface the real error message (and stack) so the admin
  // panel shows what actually went wrong instead of a blank "Internal server
  // error". In production we keep it generic — raw messages can leak internals.
  const isDev = env.NODE_ENV !== "production";
  res.status(500).json({
    error: {
      message: isDev && err instanceof Error ? err.message : "Internal server error",
      ...(isDev && err instanceof Error ? { stack: err.stack } : {}),
    },
  });
}
