import type { HydratedDocument } from "mongoose";

import { PromoCode } from "../models/PromoCode.js";
import { ApiError } from "../utils/ApiError.js";

import { assertWithinLimits } from "./promoUsage.service.js";

type TourLike = HydratedDocument<any>;
type TravellerType = "adult" | "child" | "infant";
type Traveller = { type: TravellerType; age?: number };
type ChildPricingTier = { minAge: number; maxAge: number; price: number };
type Applies = { adult?: boolean; child?: boolean; infant?: boolean } | null;
type TourDateLike = { price?: number; appliesTo?: Applies } | null;

// One line per traveller type, at that type's FINAL per-person price: the tour's
// own price for the type plus whichever airport / travel-date charges are
// ticked for it. The charges are folded in — a customer sees "Adult: Rs.X × 2",
// never a separate airport or date line. `chargesIncluded` records how much of
// `unitPrice` came from those charges, for the admin's records only.
export type PriceBreakdownLine = {
  type: TravellerType;
  count: number;
  unitPrice: number;
  chargesIncluded: number;
  subtotal: number;
};
export type PricedAirport = { code: string; addonPrice: number; appliesTo?: Applies } | null;

const round2 = (n: number) => Math.round(n * 100) / 100;

// A charge with no category settings (older rows) applies to every type — that's
// how charges behaved before categories were selectable.
const appliesTo = (a: Applies | undefined, type: TravellerType) => a?.[type] ?? true;

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

/** The airport + travel-date charges that apply to one traveller of this type. */
function chargesFor(type: TravellerType, tourDate: TourDateLike, airport: PricedAirport): number {
  let charges = 0;
  if (airport && airport.addonPrice > 0 && appliesTo(airport.appliesTo, type)) charges += airport.addonPrice;
  if (tourDate?.price && tourDate.price > 0 && appliesTo(tourDate.appliesTo, type)) charges += tourDate.price;
  return round2(charges);
}

/**
 * Same formula as flyingdotcom's booking_confirm.php — per traveller: the
 * tour's price for their type + the airport's charge + the travel date's charge
 * — but each charge is only added for the traveller types the admin ticked on
 * it (Adult / Child / Infant), and the result is ONE per-person price per type.
 *
 * So with a tour at Adult 50,000 / Child 30,000, an airport charge of 1,000
 * for Adult only and a date charge of 500 for Adult + Child, the customer is
 * priced Adult 51,500 and Child 30,500 — no separate charge lines anywhere.
 *
 * `baseAmount` is the exact sum of every line's subtotal, so the summary
 * always adds up.
 */
export function computeBaseAmount(
  tour: TourLike,
  travellers: Traveller[],
  tourDate: TourDateLike,
  airport: PricedAirport,
): { baseAmount: number; breakdown: PriceBreakdownLine[] } {
  const groups = new Map<string, PriceBreakdownLine>();
  for (const t of travellers) {
    const chargesIncluded = chargesFor(t.type, tourDate, airport);
    const unitPrice = round2(perPersonBase(tour, t) + chargesIncluded);
    const key = `${t.type}:${unitPrice}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.subtotal = round2(existing.subtotal + unitPrice);
    } else {
      groups.set(key, { type: t.type, count: 1, unitPrice, chargesIncluded, subtotal: unitPrice });
    }
  }
  const order: Record<TravellerType, number> = { adult: 0, child: 1, infant: 2 };
  const breakdown = [...groups.values()].sort((a, b) => order[a.type] - order[b.type] || a.unitPrice - b.unitPrice);

  const baseAmount = round2(breakdown.reduce((sum, l) => sum + l.subtotal, 0));
  return { baseAmount, breakdown };
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
