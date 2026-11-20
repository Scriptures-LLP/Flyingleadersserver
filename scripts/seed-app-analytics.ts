import "dotenv/config";
import mongoose from "mongoose";

import { env } from "../src/config/env.js";
import { AppDevice } from "../src/models/AppDevice.js";
import { AppEvent } from "../src/models/AppEvent.js";

/**
 * Seeds sample Flying Leader app analytics (installs, sessions, screen views)
 * spread across the last 14 days, so the admin dashboard's charts have
 * realistic data to render during development.
 *
 *   npx tsx scripts/seed-app-analytics.ts          # insert sample data
 *   npx tsx scripts/seed-app-analytics.ts --clear  # remove sample data only
 *
 * All seeded rows carry a `SEED-` deviceId prefix so --clear removes exactly
 * what this script created and nothing real.
 */
const PREFIX = "SEED-";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const SCREENS = ["home", "explore", "tour", "wishlist", "trips", "profile", "search"];
const PLATFORMS: ("android" | "ios" | "web")[] = ["android", "android", "android", "ios", "ios", "web"];

function istDay(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T,>(arr: T[]): T => arr[rand(0, arr.length - 1)] as T;

async function main() {
  await mongoose.connect(env.MONGO_URI);
  const clear = process.argv.includes("--clear");

  const dev = await AppDevice.deleteMany({ deviceId: { $regex: "^" + PREFIX } });
  const ev = await AppEvent.deleteMany({ deviceId: { $regex: "^" + PREFIX } });
  console.log(`cleared ${dev.deletedCount} devices, ${ev.deletedCount} events`);
  if (clear) {
    await mongoose.disconnect();
    return;
  }

  const now = new Date();
  const devices: { deviceId: string; platform: "android" | "ios" | "web"; firstSeenAt: Date; lastSeenAt: Date; sessions: number }[] = [];
  const events: Record<string, unknown>[] = [];

  // ~5–14 new installs/day, trending up over the fortnight.
  for (let dayAgo = 13; dayAgo >= 0; dayAgo--) {
    const dayDate = new Date(now.getTime() - dayAgo * 24 * 60 * 60 * 1000);
    const installs = rand(5, 9) + (13 - dayAgo); // gentle upward trend
    for (let i = 0; i < installs; i++) {
      const at = new Date(dayDate.getTime() - rand(0, 20) * 60 * 60 * 1000);
      const deviceId = `${PREFIX}${dayAgo}_${i}_${Math.random().toString(36).slice(2, 8)}`;
      const platform = pick(PLATFORMS);
      devices.push({ deviceId, platform, firstSeenAt: at, lastSeenAt: now, sessions: 0 });
    }
  }

  // Each device is active on a spread of days: 1–3 sessions/active-day, each
  // session fanning out into a few screen views.
  for (const d of devices) {
    const activeDays = rand(1, 10);
    let sessionCount = 0;
    for (let k = 0; k < activeDays; k++) {
      const dayAgo = rand(0, 13);
      const when = new Date(now.getTime() - dayAgo * 24 * 60 * 60 * 1000 - rand(0, 20) * 60 * 60 * 1000);
      if (when < d.firstSeenAt) continue;
      const day = istDay(when);
      const sessions = rand(1, 3);
      sessionCount += sessions;
      for (let s = 0; s < sessions; s++) {
        events.push({ deviceId: d.deviceId, type: "app_open", platform: d.platform, day, createdAt: when, updatedAt: when });
        for (let v = 0; v < rand(2, 6); v++) {
          const screen = pick(SCREENS);
          events.push({
            deviceId: d.deviceId,
            type: screen === "tour" ? "tour_view" : "screen_view",
            platform: d.platform,
            screen,
            day,
            createdAt: when,
            updatedAt: when,
          });
        }
      }
    }
    d.sessions = sessionCount;
  }

  await AppDevice.insertMany(devices);
  await AppEvent.insertMany(events, { ordered: false });
  console.log(`seeded ${devices.length} devices, ${events.length} events across 14 days`);
  console.log("Open the admin Dashboard to see the charts populate. Run with --clear to remove.");

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
