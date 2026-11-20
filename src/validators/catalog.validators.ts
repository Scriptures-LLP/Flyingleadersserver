import { z } from "zod";

import { zStrictBoolean } from "../utils/zodHelpers.js";

// A seat count that may be left blank. Empty string (how FormData carries a
// cleared number input) and null both become null; real values are coerced to
// numbers with 0 preserved. `.optional()` lets the field be omitted entirely on
// a partial update without being forced to null.
const nullableSeatCount = z
  .preprocess((v) => (v === "" || v === null ? null : v), z.coerce.number().min(0).nullable())
  .optional();

export const idParamSchema = z.object({ id: z.string().min(1) });
export const slugParamSchema = z.object({ slug: z.string().min(1) });

export const countrySchema = z.object({
  name: z.string().trim().min(1),
  coverImage: z.string().optional(),
  isActive: zStrictBoolean.optional(),
  sortOrder: z.coerce.number().min(0).optional(),
});

export const airportSchema = z.object({
  code: z.string().trim().min(2).max(10),
  name: z.string().trim().min(1),
  isActive: zStrictBoolean.optional(),
});

export const categorySchema = z.object({
  label: z.string().trim().min(1),
  image: z.string().optional(),
  sortOrder: z.coerce.number().min(0).optional(),
  isActive: zStrictBoolean.optional(),
});

export const tourSchema = z.object({
  title: z.string().trim().min(1),
  shortDesc: z.string().trim().optional(),
  fullDesc: z.string().optional(),
  location: z.string().trim().optional(),
  duration: z.string().trim().optional(),
  countryId: z.string().optional(),
  // Overseas-tour TCS flag (model default false). Must be declared here or the
  // validate middleware's zod .parse() strips it from the body before saving.
  isDomestic: zStrictBoolean.optional(),
  // Group vs Private tour — drives the app Home screen's tabs. Must be declared
  // here too; otherwise an admin's "private" selection is silently dropped and
  // every tour saves as the default "group".
  tourType: z.enum(["group", "private"]).optional(),
  category: z.string().trim().optional(),
  category2: z.string().trim().optional(),

  price: z.coerce.number().min(0),
  // Not required -- "" means the admin explicitly cleared it (see Tours.tsx),
  // as opposed to the key being absent, which leaves whatever was saved before
  // untouched on an update.
  priceChild: z.preprocess((v) => (v === "" ? null : v), z.coerce.number().min(0).nullable()).optional(),
  priceInfant: z.preprocess((v) => (v === "" ? null : v), z.coerce.number().min(0).nullable()).optional(),
  // Age-banded child pricing, e.g. [{minAge:2,maxAge:5,price:8000},{minAge:6,maxAge:9,price:9500}].
  // Sent as a JSON string when this request goes through FormData (cover-image
  // upload); parsed back into an array either way.
  childPricingTiers: z
    .preprocess((v) => (typeof v === "string" ? JSON.parse(v) : v), z.array(
      z.object({
        minAge: z.coerce.number().min(0),
        maxAge: z.coerce.number().min(0),
        price: z.coerce.number().min(0),
      }),
    ))
    .optional(),
  tokenAmount: z.coerce.number().min(0).optional(),
  allowTokenPayment: zStrictBoolean.optional(),

  itinerary: z.string().optional(),
  inclusions: z.string().optional(),
  exclusions: z.string().optional(),
  flightDetails: z.string().optional(),
  showFlightDetails: zStrictBoolean.optional(),
  hotelDetails: z.string().optional(),
  showHotelDetails: zStrictBoolean.optional(),

  // Seat counts are genuinely optional: blank means "unknown / not tracked"
  // (null), which must be distinct from an explicit 0 (sold out). Plain
  // z.coerce.number() turned "" and null into 0, so a blank seat count silently
  // saved as 0. Preprocess maps "" (and null) to null first, then coerce the
  // real numbers — so null stays null, 0 stays 0, and 30 stays 30.
  totalSeats: nullableSeatCount,
  seatsAvailable: nullableSeatCount,
  seatsRemark: z
    .enum(["Available", "Fast Selling", "Almost Sold Out", "Hot Selling", "Sold Out"])
    .optional(),

  rating: z.coerce.number().min(0).max(5).optional(),
  groupSizeLabel: z.string().trim().optional(),
  hotelClassLabel: z.string().trim().optional(),

  isActive: zStrictBoolean.optional(),
});

export const tourQuerySchema = z.object({
  category: z.string().optional(),
  countryId: z.string().optional(),
  search: z.string().optional(),
  originCity: z.string().optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});
