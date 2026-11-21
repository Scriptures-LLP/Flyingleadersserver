import type { NextFunction, Request, Response } from "express";
import type { Schema } from "mongoose";

import { getRedis } from "../config/redis.js";

// Centralised read-through (cache-aside) layer for the public catalog endpoints,
// plus the invalidation that keeps it honest. MongoDB is always the source of
// truth; everything here degrades to "just hit Mongo" the moment Redis misbehaves.
//
// INVALIDATION STRATEGY — key versioning (no SCAN/KEYS).
// Every cache key embeds a per-namespace version counter, e.g.
//   fl:cache:tours:v7:/api/v1/tours?page=2
// To invalidate a namespace we simply INCR its counter: every old key (…v7…)
// instantly becomes unreachable and ages out on its own TTL, while new reads
// compute …v8…. This is O(1), safe across multiple backend instances (the
// counter lives in Redis), and never blocks Redis with a key scan.

const PREFIX = "fl:cache";

export type CacheNamespace = "home" | "tours" | "countries" | "categories";

function versionKey(ns: CacheNamespace): string {
  return `${PREFIX}:ver:${ns}`;
}

/**
 * Express middleware implementing cache-aside for a GET route.
 *
 * - HIT  → serve the stored JSON verbatim (identical response structure).
 * - MISS → run the real handler, then store its 2xx JSON body under the key.
 * - ERROR/down → fall through to the handler (MongoDB), never fail the request.
 *
 * Only anonymous GETs are cached: a request carrying an Authorization header may
 * be user-specific, so it bypasses the shared cache entirely (no data leakage).
 */
export function cacheRoute(ns: CacheNamespace, ttlSeconds: number) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const redis = getRedis();
    if (!redis || req.method !== "GET" || req.headers.authorization) {
      next();
      return;
    }

    let key: string;
    try {
      const version = (await redis.get(versionKey(ns))) ?? "0";
      key = `${PREFIX}:${ns}:v${version}:${req.originalUrl}`;
      const cached = await redis.get(key);
      if (cached !== null) {
        console.log(`[cache] HIT  ${ns} ${req.originalUrl}`);
        res.setHeader("X-Cache", "HIT");
        res.type("application/json").send(cached);
        return;
      }
    } catch (err) {
      // Redis hiccup — serve fresh from Mongo this time.
      console.warn(`[cache] ERROR ${ns} ${req.originalUrl}: ${(err as Error).message}`);
      next();
      return;
    }

    console.log(`[cache] MISS ${ns} ${req.originalUrl}`);
    res.setHeader("X-Cache", "MISS");

    // Capture the handler's JSON body and write it to Redis — but only on
    // success, so an error payload is never cached.
    const sendJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        getRedis()
          ?.set(key, JSON.stringify(body), "EX", ttlSeconds)
          .catch(() => {
            /* best-effort: a failed write just means the next request re-computes */
          });
      }
      return sendJson(body);
    }) as Response["json"];

    next();
  };
}

/**
 * Bump the version of one or more namespaces, instantly orphaning their cached
 * entries. Best-effort and non-throwing: a failed bump at worst leaves data
 * stale until its TTL, and must never break the write that triggered it.
 */
export async function invalidate(...namespaces: CacheNamespace[]): Promise<void> {
  const redis = getRedis();
  if (!redis || namespaces.length === 0) return;
  try {
    await Promise.all(namespaces.map((ns) => redis.incr(versionKey(ns))));
    console.log(`[cache] INVALIDATE ${namespaces.join(", ")}`);
  } catch (err) {
    console.warn(`[cache] invalidate failed: ${(err as Error).message}`);
  }
}

/**
 * Attach automatic cache invalidation to a Mongoose schema. Any write to the
 * model — via Model.create, doc.save, insertMany, or the findOneAnd* / update* /
 * delete* query helpers the admin controllers use — bumps the given namespaces.
 *
 * Centralising this at the model layer (rather than in each controller) means a
 * new write path can't silently forget to invalidate. Fired-and-forgotten so it
 * never delays the response or fails the write when Redis is down.
 */
export function registerCacheInvalidation(schema: Schema, namespaces: CacheNamespace[]): void {
  const fire = () => {
    void invalidate(...namespaces);
  };
  schema.post("save", fire);
  schema.post("insertMany", fire);
  schema.post(
    ["findOneAndUpdate", "findOneAndDelete", "findOneAndReplace", "updateOne", "updateMany", "deleteOne", "deleteMany"],
    fire,
  );
}
