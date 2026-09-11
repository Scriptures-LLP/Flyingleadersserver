import { z } from "zod";

export const idParamSchema = z.object({ id: z.string().min(1) });
export const slugParamSchema = z.object({ slug: z.string().min(1) });

export const countrySchema = z.object({
  name: z.string().trim().min(1),
  coverImage: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  sortOrder: z.coerce.number().optional(),
});

export const airportSchema = z.object({
  code: z.string().trim().min(2).max(10),
  name: z.string().trim().min(1),
  isActive: z.coerce.boolean().optional(),
});

export const categorySchema = z.object({
  label: z.string().trim().min(1),
  image: z.string().optional(),
  sortOrder: z.coerce.number().optional(),
  isActive: z.coerce.boolean().optional(),
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
  tokenAmount: z.coerce.number().min(0).optional(),
  allowTokenPayment: z.coerce.boolean().optional(),

  itinerary: z.string().optional(),
  inclusions: z.string().optional(),
  exclusions: z.string().optional(),
  flightDetails: z.string().optional(),
  showFlightDetails: z.coerce.boolean().optional(),
  hotelDetails: z.string().optional(),
  showHotelDetails: z.coerce.boolean().optional(),

  totalSeats: z.coerce.number().min(0).optional(),
  seatsAvailable: z.coerce.number().min(0).optional(),
  seatsRemark: z
    .enum(["Available", "Fast Selling", "Almost Sold Out", "Hot Selling", "Sold Out"])
    .optional(),

  rating: z.coerce.number().min(0).max(5).optional(),
  groupSizeLabel: z.string().trim().optional(),
  hotelClassLabel: z.string().trim().optional(),

  isActive: z.coerce.boolean().optional(),
});

export const tourQuerySchema = z.object({
  category: z.string().optional(),
  countryId: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});
