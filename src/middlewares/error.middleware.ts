import type { NextFunction, Request, Response } from "express";
import { MongoServerError } from "mongodb";
import mongoose from "mongoose";

import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

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

  console.error(err);
  res.status(500).json({
    error: {
      message: "Internal server error",
      ...(env.NODE_ENV !== "production" && err instanceof Error ? { stack: err.stack } : {}),
    },
  });
}
