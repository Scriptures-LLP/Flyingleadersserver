import { env } from "../config/env.js";
import { Customer } from "../models/Customer.js";
import { Notification } from "../models/Notification.js";
import { PushToken } from "../models/PushToken.js";

export type PushCategory = "promotions" | "bookingUpdates" | "tripReminders";
export type PushPayload = {
  title: string;
  body: string;
  category: PushCategory;
  /** Where tapping goes: { screen: "booking" | "tour" | "referral" | "trips" | "home", bookingId?, tourSlug? } */
  data?: Record<string, unknown>;
  campaignId?: string;
};
export type DeliveryStats = { recipients: number; devices: number; sent: number; failed: number };

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_CHUNK = 100; // Expo's limit per request
const OFFER_TTL_SECONDS = 24 * 60 * 60; // if the phone is off, keep trying for a day, then drop it

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: "default";
  channelId: "default";
  priority: "high";
  ttl: number;
};
type ExpoTicket = { status: "ok" | "error"; id?: string; message?: string; details?: { error?: string } };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const PUSH_TOKEN_RE = /^Expo(nent)?PushToken\[[^\]\s]+\]$/;

// ---- device registration ---------------------------------------------------

/** Ties this phone's push token to the signed-in customer (re-pointing it if someone else used the phone before). */
export async function registerPushToken(customerId: string, token: string, platform: "android" | "ios", deviceName?: string) {
  return PushToken.findOneAndUpdate(
    { token },
    { $set: { customerId, platform, deviceName, isActive: true, lastSeenAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

/** Signing out: this phone stops receiving this customer's notifications. */
export async function unregisterPushToken(customerId: string, token: string) {
  await PushToken.deleteOne({ token, customerId });
}

// ---- who may be notified ---------------------------------------------------

/** Of these customers, those with an active account who haven't switched this kind of notification off. */
export async function eligibleCustomerIds(customerIds: string[], category: PushCategory): Promise<string[]> {
  if (customerIds.length === 0) return [];
  const ids = await Customer.find({
    _id: { $in: customerIds },
    isActive: true,
    [`notificationPreferences.${category}`]: { $ne: false },
  }).distinct("_id");
  return ids.map(String);
}

export async function countDevices(customerIds: string[]): Promise<number> {
  if (customerIds.length === 0) return 0;
  const owners = await PushToken.distinct("customerId", { customerId: { $in: customerIds }, isActive: true });
  return owners.length;
}

// ---- sending ---------------------------------------------------------------

async function postToExpo(messages: ExpoMessage[]): Promise<ExpoTicket[]> {
  if (env.PUSH_DRY_RUN) {
    console.log(`[push] DRY RUN — would send ${messages.length} notification(s): "${messages[0]?.title}"`);
    return messages.map(() => ({ status: "ok" as const, id: "dry-run" }));
  }

  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(messages),
    });
    // Rate-limited or Expo having a moment: one more try after a pause.
    if (res.status === 429 || res.status >= 500) {
      lastError = `HTTP ${res.status}`;
      await sleep(1000);
      continue;
    }
    const json = (await res.json().catch(() => ({}))) as { data?: ExpoTicket[]; errors?: unknown };
    if (!res.ok || !Array.isArray(json.data)) {
      throw new Error(`Expo push rejected the request (HTTP ${res.status}): ${JSON.stringify(json.errors ?? json).slice(0, 300)}`);
    }
    return json.data;
  }
  throw new Error(`Expo push unavailable (${lastError})`);
}

/**
 * Delivers one notification to a set of customers: an inbox entry for each
 * customer who hasn't switched this kind off, and a push to each of their
 * registered phones. Never throws — a failure is counted and logged, so a push
 * problem can't break the payment / booking / admin action that triggered it.
 */
export async function deliverToCustomers(customerIds: string[], payload: PushPayload): Promise<DeliveryStats> {
  const stats: DeliveryStats = { recipients: 0, devices: 0, sent: 0, failed: 0 };
  try {
    const recipients = await eligibleCustomerIds(customerIds, payload.category);
    stats.recipients = recipients.length;
    if (recipients.length === 0) return stats;

    const inbox = await Notification.insertMany(
      recipients.map((customerId) => ({
        customerId,
        title: payload.title,
        body: payload.body,
        category: payload.category,
        data: payload.data,
        campaignId: payload.campaignId,
      })),
    );
    const inboxIdByCustomer = new Map(inbox.map((n) => [String(n.customerId), String(n._id)]));

    const tokens = await PushToken.find({ customerId: { $in: recipients }, isActive: true }).lean();
    stats.devices = tokens.length;

    const messages: ExpoMessage[] = tokens.map((t) => ({
      to: t.token,
      title: payload.title,
      body: payload.body,
      // notificationId lets the app mark this inbox entry read when it's tapped.
      data: { ...(payload.data ?? {}), notificationId: inboxIdByCustomer.get(String(t.customerId)) },
      sound: "default",
      channelId: "default",
      priority: "high",
      ttl: OFFER_TTL_SECONDS,
    }));

    const dead: string[] = [];
    for (let i = 0; i < messages.length; i += EXPO_CHUNK) {
      const chunk = messages.slice(i, i + EXPO_CHUNK);
      try {
        const tickets = await postToExpo(chunk);
        tickets.forEach((ticket, idx) => {
          if (ticket.status === "ok") {
            stats.sent += 1;
          } else {
            stats.failed += 1;
            // The phone is gone (app uninstalled / token revoked): stop sending to it.
            if (ticket.details?.error === "DeviceNotRegistered") dead.push(chunk[idx]!.to);
            else console.error(`[push] ticket error: ${ticket.details?.error ?? ticket.message}`);
          }
        });
      } catch (err) {
        stats.failed += chunk.length;
        console.error("[push] send failed:", err instanceof Error ? err.message : err);
      }
    }
    if (dead.length) await PushToken.updateMany({ token: { $in: dead } }, { $set: { isActive: false } });
  } catch (err) {
    console.error("[push] delivery failed:", err);
  }
  return stats;
}
