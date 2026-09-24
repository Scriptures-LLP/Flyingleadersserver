import { Booking } from "../models/Booking.js";
import { Customer } from "../models/Customer.js";

import { countDevices, eligibleCustomerIds, type PushCategory } from "./push.service.js";

/** Who an admin notification goes to. */
export type AudienceSpec = {
  type: "all" | "customer" | "tour_booked" | "balance_due" | "travelling_soon" | "never_booked";
  tourId?: string;
  customerId?: string;
  /** travelling_soon: how many days ahead to look. */
  days?: number;
};

// Statuses that mean money has actually been paid on a booking.
const PAID = ["partial", "paid", "refund_initiated"] as const;

async function matchingCustomerIds(spec: AudienceSpec): Promise<string[]> {
  switch (spec.type) {
    case "all":
      return (await Customer.find({ isActive: true }).distinct("_id")).map(String);
    case "customer":
      return spec.customerId ? [spec.customerId] : [];
    case "tour_booked":
      if (!spec.tourId) return [];
      return (
        await Booking.distinct("customerId", { tourId: spec.tourId, paymentStatus: { $in: PAID }, status: { $ne: "cancelled" } })
      ).map(String);
    case "balance_due":
      return (await Booking.distinct("customerId", { paymentStatus: "partial", status: { $ne: "cancelled" } })).map(String);
    case "travelling_soon": {
      const now = new Date();
      const until = new Date(now.getTime() + Math.max(1, Math.min(spec.days ?? 7, 365)) * 864e5);
      return (await Booking.distinct("customerId", { status: "confirmed", travelDate: { $gte: now, $lte: until } })).map(String);
    }
    case "never_booked": {
      const bookedIds = await Booking.distinct("customerId", { paymentStatus: { $in: PAID } });
      return (await Customer.find({ isActive: true, _id: { $nin: bookedIds } }).distinct("_id")).map(String);
    }
  }
}

/**
 * Resolves an audience to the customers who'll actually get it: everyone
 * matching the description, minus anyone who's switched this kind of
 * notification off. `devices` is how many of those can also be pushed to right
 * now — the rest still see it in their in-app inbox.
 */
export async function resolveAudience(spec: AudienceSpec, category: PushCategory) {
  const matching = await matchingCustomerIds(spec);
  const recipients = await eligibleCustomerIds(matching, category);
  const devices = await countDevices(recipients);
  return { audience: matching.length, recipients, devices };
}
