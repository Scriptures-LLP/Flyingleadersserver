import type { NextFunction, Request, Response } from "express";

import { ApiError } from "../utils/ApiError.js";

// Every assistant message is a paid model call (often several, with tools), so
// cap how fast one customer can send them — a stuck retry loop or a script
// shouldn't be able to run up the bill. In memory is enough: one server instance.
const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, number[]>();

export function chatMessageLimit(req: Request, _res: Response, next: NextFunction) {
  const now = Date.now();
  const customer = req.customer!.sub;
  const recent = (hits.get(customer) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    return next(ApiError.tooManyRequests("You're sending messages very quickly — please wait a few minutes and try again."));
  }
  recent.push(now);
  hits.set(customer, recent);

  if (hits.size > 5000) {
    for (const [key, times] of hits) if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(key);
  }
  next();
}
