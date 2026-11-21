import { Redis } from "ioredis";

import { env } from "./env.js";

// The ONE Redis connection for the whole process. Controllers never construct
// their own client — they go through the cache service, which calls getRedis().
// Redis is strictly an accelerator: if it's not configured or not reachable,
// getRedis()/commands fail fast and callers fall back to MongoDB (the source of
// truth). See services/cache.service.ts.
let client: Redis | null = null;
let outageLogged = false;

/** Caching is on only when explicitly enabled AND a URL is configured. */
export function cacheEnabled(): boolean {
  return env.CACHE_ENABLED && env.REDIS_URL.length > 0;
}

export function getRedis(): Redis | null {
  if (!cacheEnabled()) return null;
  if (client) return client;

  client = new Redis(env.REDIS_URL, {
    // Fail fast instead of hanging a request when Redis is down: don't queue
    // commands while disconnected, and give each command at most one retry — the
    // caller then immediately falls back to Mongo.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    // Keep trying to reconnect in the background with a capped backoff, so a
    // transient Redis blip heals itself without a server restart.
    retryStrategy: (times) => Math.min(1000 + times * 500, 10_000),
    reconnectOnError: () => true,
  });

  client.on("ready", () => {
    outageLogged = false;
    console.log("[redis] connected and ready");
  });
  // A down Redis emits errors continuously; log the outage once (not per command)
  // so the logs stay readable and never leak the URL/credentials.
  client.on("error", (err) => {
    if (!outageLogged) {
      outageLogged = true;
      console.warn("[redis] unavailable — serving from MongoDB until it recovers:", err.message);
    }
  });

  return client;
}

/** Closes the connection on shutdown so the process can exit cleanly. */
export async function closeRedis(): Promise<void> {
  if (!client) return;
  try {
    await client.quit();
  } catch {
    client.disconnect();
  } finally {
    client = null;
  }
}
