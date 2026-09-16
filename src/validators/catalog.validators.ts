import { z } from "zod";

import { zStrictBoolean } from "../utils/zodHelpers.js";

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
  category: z.string().trim().optional(),

  price: z.coerce.number().min(0),
  priceChild: z.coerce.number().min(0).optional(),
  priceInfant: z.coerce.number().min(0).optional(),
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

  totalSeats: z.coerce.number().min(0).optional(),
  seatsAvailable: z.coerce.number().min(0).optional(),
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
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});
