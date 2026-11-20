import type { Request, Response } from "express";

import { AppDevice } from "../../models/AppDevice.js";
import { AppEvent } from "../../models/AppEvent.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// IST calendar day (YYYY-MM-DD) — the business's own day, matching how the
// dashboard and the legacy traffic table bucket time.
function todayIsoDateIst(now = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

type IncomingEvent = {
  type: (typeof import("../../models/AppEvent.js").APP_EVENT_TYPES)[number];
  screen?: string;
  tourId?: string;
  meta?: Record<string, unknown>;
};

/**
 * The app's analytics beacon. Called on app open and as the user moves around:
 * it keeps the device's AppDevice row fresh (install date, last-seen, session
 * count, who's signed in) and appends one AppEvent per reported action.
 *
 * Analytics must never degrade the app, so this is deliberately fire-and-forget
 * from the client's side: it always answers 204, and any storage error is
 * swallowed here rather than surfaced. `optionalAuth` means a logged-in device
 * gets its customerId attached; a guest is tracked anonymously by deviceId.
 */
export const track = asyncHandler(async (req: Request, res: Response) => {
  const { deviceId, platform, appVersion, deviceName, events } = req.body as {
    deviceId: string;
    platform: "android" | "ios" | "web";
    appVersion?: string;
    deviceName?: string;
    events: IncomingEvent[];
  };

  const customerId = req.customer?.sub ?? null;
  const now = new Date();
  const day = todayIsoDateIst(now);
  const opens = events.filter((e) => e.type === "app_open").length;

  try {
    await AppDevice.updateOne(
      { deviceId },
      {
        $set: {
          platform,
          lastSeenAt: now,
          ...(appVersion ? { appVersion } : {}),
          ...(deviceName ? { deviceName } : {}),
          ...(customerId ? { customerId } : {}),
        },
        $setOnInsert: { firstSeenAt: now },
        ...(opens > 0 ? { $inc: { sessions: opens } } : {}),
      },
      { upsert: true },
    );

    if (events.length) {
      await AppEvent.insertMany(
        events.map((e) => ({
          deviceId,
          customerId,
          type: e.type,
          platform,
          appVersion,
          screen: e.screen,
          tourId: e.tourId ?? null,
          meta: e.meta,
          day,
        })),
        { ordered: false },
      );
    }
  } catch (err) {
    // Best-effort: a dropped beacon is never worth failing the request over.
    console.warn("[analytics] track failed:", (err as Error).message || err);
  }

  res.status(204).send();
});
