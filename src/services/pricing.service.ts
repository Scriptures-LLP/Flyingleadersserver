import type { HydratedDocument } from "mongoose";

import { PromoCode } from "../models/PromoCode.js";
import { ApiError } from "../utils/ApiError.js";

import { assertWithinLimits } from "./promoUsage.service.js";

type TourLike = HydratedDocument<any>;
type TravellerType = "adult" | "child" | "infant";
type Traveller = { type: TravellerType; age?: number };
type ChildPricingTier = { minAge: number; maxAge: number; price: number };
type TourDateLike = {
  price?: number;
  appliesTo?: { adult: boolean; child: boolean; infant: boolean } | null;
} | null;

// Base price lines carry ONLY the tour's own per-type price (what the admin
// set on the tour) — airport and date charges never get folded into them.
export type PriceBreakdownLine = { type: TravellerType; count: number; unitPrice: number; subtotal: number };
// Add-ons are their own lines so the airport price (Tour Airport Prices) and
// the date price (Tour Dates) each show up exactly as configured, separately.
export type AddonLine = {
  kind: "airport" | "date";
  label: string;
  count: number;
  unitPrice: number;
  subtotal: number;
};
export type PricedAirport = { code: string; addonPrice: number } | null;

const round2 = (n: number) => Math.round(n * 100) / 100;

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
 * Same formula as flyingdotcom's booking_confirm.php — per traveller: the
 * tour's price for their type + the airport's add-on + the travel date's
 * add-on — but returned as separate, individually-labelled pieces instead of
 * one blended per-person figure:
 *
 *  - `breakdown`: one line per traveller type at the tour's own price
 *    ("2 adults × Rs.X", "1 child × Rs.Y", "1 infant × Rs.Z");
 *  - `addons`: the airport charge (applies to every traveller) and the date
 *    charge (only the traveller types it's configured to apply to), each only
 *    when configured above zero.
 *
 * `baseAmount` is the exact sum of every line, so the summary always adds up.
 */
export function computeBaseAmount(
  tour: TourLike,
  travellers: Traveller[],
  tourDate: TourDateLike,
  airport: PricedAirport,
): { baseAmount: number; breakdown: PriceBreakdownLine[]; addons: AddonLine[] } {
  const groups = new Map<string, PriceBreakdownLine>();
  for (const t of travellers) {
    const unitPrice = perPersonBase(tour, t);
    const key = `${t.type}:${unitPrice}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.subtotal = round2(existing.subtotal + unitPrice);
    } else {
      groups.set(key, { type: t.type, count: 1, unitPrice, subtotal: unitPrice });
    }
  }
  const order: Record<TravellerType, number> = { adult: 0, child: 1, infant: 2 };
  const breakdown = [...groups.values()].sort((a, b) => order[a.type] - order[b.type]);

  const addons: AddonLine[] = [];
  if (airport && airport.addonPrice > 0) {
    addons.push({
      kind: "airport",
      label: `Airport charge (${airport.code})`,
      count: travellers.length,
      unitPrice: airport.addonPrice,
      subtotal: round2(airport.addonPrice * travellers.length),
    });
  }
  if (tourDate?.price && tourDate.price > 0) {
    const count = travellers.filter((t) => tourDate.appliesTo?.[t.type] ?? true).length;
    if (count > 0) {
      addons.push({
        kind: "date",
        label: "Travel date charge",
        count,
        unitPrice: tourDate.price,
        subtotal: round2(tourDate.price * count),
      });
    }
  }

  const baseAmount = round2(
    breakdown.reduce((sum, l) => sum + l.subtotal, 0) + addons.reduce((sum, l) => sum + l.subtotal, 0),
  );
  return { baseAmount, breakdown, addons };
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

  // Total + per-customer limits — counts held (unpaid, recently created) and
  // redeemed (paid) uses, not just paid ones. A customer's own older unpaid
  // bookings don't count against them: the new booking replaces those.
  await assertWithinLimits(promo, customerId, { supersedeCustomerId: customerId });

  let discount = promo.type === "percent" ? (cartTotal * promo.value) / 100 : promo.value;
  if (promo.type === "percent" && promo.maxDiscount) discount = Math.min(discount, promo.maxDiscount);
  discount = Math.max(0, Math.min(discount, cartTotal));

  return { promo, discountAmount: Math.round(discount * 100) / 100 };
}
