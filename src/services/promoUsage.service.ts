import type { HydratedDocument, Types } from "mongoose";

import { Booking } from "../models/Booking.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * Promo-code usage limits.
 *
 * A booking is created *before* it's paid, so counting only paid bookings
 * (what this used to do) let a customer stack up any number of unpaid
 * bookings with a "use once" code — every one passed the check. A code use is
 * therefore counted in two ways:
 *
 *  - **redeemed** — the booking has taken money (partial / paid / part-refunded)
 *    and isn't cancelled. Permanent until the booking is refunded or cancelled.
 *  - **held** — the booking is still unpaid but reserved the code within the
 *    last PROMO_HOLD_MINUTES. Like a cart reservation: it stops the code being
 *    over-issued, and frees itself if the customer walks away.
 *
 * Limits are enforced when a booking is created (this file's `assertWithinLimits`
 * plus the `claim` race guard) and, as the hard gate, again right before a
 * payment order is opened — the last moment before money can move.
 */

export const PROMO_HOLD_MINUTES = 30;

type PromoDoc = HydratedDocument<any>;
type Id = Types.ObjectId | string;

export const promoHoldExpiry = () => new Date(Date.now() + PROMO_HOLD_MINUTES * 60_000);

const REDEEMED = {
  status: { $ne: "cancelled" },
  paymentStatus: { $in: ["partial", "paid", "refund_initiated"] },
} as const;

function heldClause(now: Date, exceptCustomerId?: Id) {
  return {
    status: "pending_payment",
    paymentStatus: "unpaid",
    promoHoldUntil: { $gte: now },
    // A customer's own older unpaid bookings are replaced when they make or
    // pay for another one, so those *soft* holds don't count against them.
    // A firm hold (a payment order is already open) always counts — otherwise
    // two orders could be opened, and paid, for a one-use code.
    ...(exceptCustomerId ? { $or: [{ customerId: { $ne: exceptCustomerId } }, { promoHoldFirm: true }] } : {}),
  };
}

type Scope = {
  /** Only count this customer's uses (per-customer limit). */
  customerId?: Id;
  /** Never count this booking (the one being checked). */
  excludeBookingId?: Id;
  /** Don't let `supersedeCustomerId`'s own unpaid holds count. */
  supersedeCustomerId?: Id;
  /** Only count bookings created before this one (race ordering). */
  before?: { createdAt: Date; _id: Id };
};

function usageQuery(promoId: Id, scope: Scope) {
  const query: Record<string, unknown> = {
    "pricing.promoCodeId": promoId,
    $or: [REDEEMED, heldClause(new Date(), scope.supersedeCustomerId)],
  };
  if (scope.customerId) query.customerId = scope.customerId;
  if (scope.excludeBookingId) query._id = { $ne: scope.excludeBookingId };
  if (scope.before) {
    query.$and = [
      {
        $or: [
          { createdAt: { $lt: scope.before.createdAt } },
          { createdAt: scope.before.createdAt, _id: { $lt: scope.before._id } },
        ],
      },
    ];
  }
  return query;
}

const LIMIT_REACHED = "This promo code has reached its usage limit";
const USER_LIMIT_REACHED = "You've already used this promo code the maximum number of times";

/**
 * Throws if handing this customer one more use would break either limit.
 * `scope` refines what counts (see Scope); pass `supersedeCustomerId` so a
 * customer's own unpaid bookings never block them from replacing them.
 */
export async function assertWithinLimits(promo: PromoDoc, customerId: Id, scope: Omit<Scope, "customerId"> = {}) {
  if (promo.usageLimit) {
    const used = await Booking.countDocuments(usageQuery(promo._id, scope));
    if (used >= promo.usageLimit) throw ApiError.badRequest(LIMIT_REACHED);
  }
  if (promo.perUserLimit) {
    const usedByCustomer = await Booking.countDocuments(usageQuery(promo._id, { ...scope, customerId }));
    if (usedByCustomer >= promo.perUserLimit) throw ApiError.badRequest(USER_LIMIT_REACHED);
  }
}

/**
 * Called right after a booking with a promo code is created. Two requests can
 * both pass the pre-check at the same instant; this settles it
 * deterministically — the bookings created first keep their use, any beyond
 * the limit are refused (the caller deletes the new booking). On success the
 * customer's own older unpaid bookings for this code are released, since this
 * one replaces them.
 */
export async function claimPromoUse(promo: PromoDoc, booking: { _id: Id; customerId: Id; createdAt: Date }) {
  await assertWithinLimits(promo, booking.customerId, {
    supersedeCustomerId: booking.customerId,
    before: { createdAt: booking.createdAt, _id: booking._id },
  });
  await releaseOwnHolds(promo._id, booking.customerId, booking._id);
}

/**
 * The hard gate: run before opening a payment order for a booking that hasn't
 * taken any money yet. Re-checks the limits against everyone else's bookings
 * (holds may have expired since it was created and the code used up in the
 * meantime), then re-reserves the code for the payment window.
 */
export async function assertCanPayWithPromo(booking: {
  _id: Id;
  customerId: Id;
  amountPaid: number;
  pricing: { promoCodeId?: Id | null };
}) {
  const promoId = booking.pricing.promoCodeId;
  if (!promoId || booking.amountPaid > 0) return; // no promo, or its use is already redeemed

  const { PromoCode } = await import("../models/PromoCode.js");
  const promo = await PromoCode.findById(promoId);
  if (!promo) return;

  try {
    await assertWithinLimits(promo, booking.customerId, {
      excludeBookingId: booking._id,
      supersedeCustomerId: booking.customerId,
    });
  } catch {
    throw ApiError.badRequest(
      "The promo code on this booking is no longer available — its usage limit has been reached. " +
        "Please make a new booking without the code.",
    );
  }

  // Payment is about to start: make the reservation firm for the payment window.
  await Booking.updateOne({ _id: booking._id }, { $set: { promoHoldUntil: promoHoldExpiry(), promoHoldFirm: true } });
  await releaseOwnHolds(promo._id, booking.customerId, booking._id);
}

/** Frees the customer's other unpaid bookings' *soft* hold on this code (never one with a payment in progress). */
async function releaseOwnHolds(promoId: Id, customerId: Id, exceptBookingId: Id) {
  await Booking.updateMany(
    {
      customerId,
      "pricing.promoCodeId": promoId,
      _id: { $ne: exceptBookingId },
      status: "pending_payment",
      paymentStatus: "unpaid",
      promoHoldFirm: { $ne: true },
    },
    { $unset: { promoHoldUntil: 1 } },
  );
}

/** Redeemed / held use counts per promo, for the admin panel. */
export async function usageByPromo(): Promise<Map<string, { redeemed: number; held: number }>> {
  const now = new Date();
  const rows = await Booking.aggregate<{ _id: Types.ObjectId; redeemed: number; held: number }>([
    { $match: { "pricing.promoCodeId": { $ne: null } } },
    {
      $group: {
        _id: "$pricing.promoCodeId",
        redeemed: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: ["$status", "cancelled"] },
                  { $in: ["$paymentStatus", ["partial", "paid", "refund_initiated"]] },
                ],
              },
              1,
              0,
            ],
          },
        },
        held: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$status", "pending_payment"] },
                  { $eq: ["$paymentStatus", "unpaid"] },
                  { $gte: ["$promoHoldUntil", now] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), { redeemed: r.redeemed, held: r.held }]));
}
