import type { HydratedDocument } from "mongoose";

import { PromoCode } from "../models/PromoCode.js";
import { ApiError } from "../utils/ApiError.js";

type TourLike = HydratedDocument<any>;
type TravellerType = "adult" | "child" | "infant";
type Traveller = { type: TravellerType; age?: number };
type ChildPricingTier = { minAge: number; maxAge: number; price: number };
type TourDateLike = {
  price?: number;
  appliesTo?: { adult: boolean; child: boolean; infant: boolean } | null;
} | null;

export type TravellerPriceEntry = { type: TravellerType; unitPrice: number; totalPerPerson: number };
export type PriceBreakdownLine = { type: TravellerType; count: number; unitPrice: number; subtotal: number };

// Age-banded tiers take priority when configured and the traveller's age
// falls in one of them; otherwise falls back to the flat priceChild (or the
// adult price if that isn't set either) so tours without tiers keep working.
function childPrice(tour: TourLike, age: number | undefined): number {
  const tiers = tour.childPricingTiers as ChildPricingTier[] | undefined;
  if (tiers?.length && age !== undefined) {
    const tier = tiers.find((t) => age >= t.minAge && age <= t.maxAge);
    if (tier) return tier.price;
  }
  return tour.priceChild ?? tour.price;
}

function perPersonBase(tour: TourLike, traveller: Traveller): number {
  if (traveller.type === "child") return childPrice(tour, traveller.age);
  if (traveller.type === "infant") return tour.priceInfant ?? 0;
  return tour.price;
}

/**
 * Mirrors flyingdotcom's booking_confirm.php: the tour's base per-traveller
 * price, plus a flat per-person add-on for the chosen airport, plus the
 * travel date's own add-on (only for the traveller types it's configured to
 * apply to — defaults to all three when the date has no price at all).
 * Returns both the total and a per-traveller breakdown so the app can show
 * "Adults: 2 x Rs.X, Children: 1 x Rs.Y, ..." before payment.
 */
export function computeBaseAmount(
  tour: TourLike,
  travellers: Traveller[],
  tourDate: TourDateLike,
  airportAddOnPerPerson: number,
): { baseAmount: number; entries: TravellerPriceEntry[] } {
  const entries = travellers.map((t) => {
    let addon = airportAddOnPerPerson;
    if (tourDate?.price && (tourDate.appliesTo?.[t.type] ?? true)) {
      addon += tourDate.price;
    }
    const unitPrice = perPersonBase(tour, t);
    return { type: t.type, unitPrice, totalPerPerson: unitPrice + addon };
  });
  const baseAmount = entries.reduce((sum, e) => sum + e.totalPerPerson, 0);
  return { baseAmount, entries };
}

/** Groups per-traveller prices into display lines like "2 adults @ Rs.X". */
export function groupPriceBreakdown(entries: TravellerPriceEntry[]): PriceBreakdownLine[] {
  const groups = new Map<string, PriceBreakdownLine>();
  for (const e of entries) {
    const key = `${e.type}:${e.totalPerPerson}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.subtotal += e.totalPerPerson;
    } else {
      groups.set(key, { type: e.type, count: 1, unitPrice: e.totalPerPerson, subtotal: e.totalPerPerson });
    }
  }
  const order: Record<TravellerType, number> = { adult: 0, child: 1, infant: 2 };
  return [...groups.values()].sort((a, b) => order[a.type] - order[b.type]);
}

export type PromoResult = {
  promo: HydratedDocument<any> | null;
  discountAmount: number;
};

/** Mirrors flyingdotcom/inc/promo.php's applyPromo() validation rules. */
export async function validatePromoCode(
  code: string,
  tourId: string,
  cartTotal: number,
  customerId: string,
): Promise<PromoResult> {
  const promo = await PromoCode.findOne({ code: code.trim().toUpperCase(), isActive: true });
  if (!promo) throw ApiError.badRequest("Invalid or inactive promo code");
  if (promo.tourId && String(promo.tourId) !== tourId) {
    throw ApiError.badRequest("This promo code doesn't apply to this tour");
  }

  const now = new Date();
  if (promo.startsAt && now < promo.startsAt) throw ApiError.badRequest("This promo code isn't active yet");
  if (promo.expiresAt && now > promo.expiresAt) throw ApiError.badRequest("This promo code has expired");
  if (promo.minCart && cartTotal < promo.minCart) {
    throw ApiError.badRequest(`Minimum booking amount of ₹${promo.minCart} required for this promo code`);
  }

  if (promo.usageLimit) {
    const { Booking } = await import("../models/Booking.js");
    const used = await Booking.countDocuments({
      "pricing.promoCodeId": promo._id,
      paymentStatus: { $in: ["partial", "paid"] },
    });
    if (used >= promo.usageLimit) throw ApiError.badRequest("This promo code has reached its usage limit");
  }

  if (promo.perUserLimit) {
    const { Booking } = await import("../models/Booking.js");
    const usedByCustomer = await Booking.countDocuments({
      customerId,
      "pricing.promoCodeId": promo._id,
      paymentStatus: { $in: ["partial", "paid"] },
    });
    if (usedByCustomer >= promo.perUserLimit) {
      throw ApiError.badRequest("You've already used this promo code the maximum number of times");
    }
  }

  let discount = promo.type === "percent" ? (cartTotal * promo.value) / 100 : promo.value;
  if (promo.type === "percent" && promo.maxDiscount) discount = Math.min(discount, promo.maxDiscount);
  discount = Math.max(0, Math.min(discount, cartTotal));

  return { promo, discountAmount: Math.round(discount * 100) / 100 };
}
