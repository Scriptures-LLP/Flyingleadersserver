import type { Server } from "http";

import mongoose from "mongoose";

import { app } from "./app.js";
import { connectDB } from "./config/db.js";
import { env } from "./config/env.js";
import { cacheEnabled, closeRedis, getRedis } from "./config/redis.js";

async function main() {
  await connectDB();

  // Kick off the Redis connection at startup (optional accelerator). getRedis()
  // is lazy, so touching it here starts connecting and surfaces the ready/outage
  // log early — but the server does NOT wait on it: requests work regardless.
  if (cacheEnabled()) {
    getRedis();
    console.log("[cache] Redis caching enabled");
  } else {
    console.log("[cache] Redis caching disabled (no REDIS_URL / CACHE_ENABLED=false) — serving from MongoDB");
  }

  const server = app.listen(env.PORT, () => {
    console.log(`[server] listening on http://localhost:${env.PORT}`);
  });

  registerShutdown(server);
}

// Close the HTTP server, Redis, and Mongo cleanly so a deploy/restart doesn't
// drop in-flight work or leak connections. Idempotent (a second signal is ignored).
function registerShutdown(server: Server) {
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] ${signal} received — shutting down`);
    server.close();
    await closeRedis();
    await mongoose.connection.close().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[server] failed to start:", err);
  process.exit(1);
});
