import type { NextFunction, Request, Response } from "express";

import { ApiError } from "../utils/ApiError.js";

// Each OTP request costs an SMS, so cap how many one client can trigger: without
// a cap anyone could script requests for random numbers and drain the SMS
// balance. In memory is enough — there is a single server instance.
const WINDOW_MS = 60 * 60_000;
const MAX_PER_WINDOW = 15;
const hits = new Map<string, number[]>();

// Behind Render's proxy req.ip is the proxy, so use the forwarded client address.
function clientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return first || req.ip || "unknown";
}

export function otpSendIpLimit(req: Request, _res: Response, next: NextFunction) {
  const now = Date.now();
  const ip = clientIp(req);
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    return next(ApiError.tooManyRequests("Too many code requests from this device. Please try again in a while."));
  }
  recent.push(now);
  hits.set(ip, recent);

  // Keep the map from growing without bound.
  if (hits.size > 5000) {
    for (const [key, times] of hits) if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(key);
  }
  next();
}
