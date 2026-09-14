import { z } from "zod";

export const idParamSchema = z.object({ id: z.string().min(1) });

export const promoCodeSchema = z.object({
  code: z.string().trim().min(1),
  tourId: z.string().min(1).optional().nullable(),
  type: z.enum(["percent", "amount"]),
  value: z.coerce.number().min(0),
  maxDiscount: z.coerce.number().min(0).optional(),
  minCart: z.coerce.number().min(0).optional(),
  usageLimit: z.coerce.number().min(0).optional(),
  perUserLimit: z.coerce.number().min(0).optional(),
  startsAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  isActive: z.coerce.boolean().optional(),
  note: z.string().trim().optional(),
});

export const tourDateSchema = z.object({
  tourId: z.string().min(1),
  airportId: z.string().min(1).optional().nullable(),
  date: z.coerce.date(),
  price: z.coerce.number().min(0),
  label: z.string().trim().optional(),
  isActive: z.coerce.boolean().optional(),
  sortOrder: z.coerce.number().optional(),
});

export const tourAirportPriceSchema = z.object({
  tourId: z.string().min(1),
  airportId: z.string().min(1),
  addonPrice: z.coerce.number().min(0),
  isActive: z.coerce.boolean().optional(),
});

export const galleryImageSchema = z.object({
  title: z.string().trim().optional(),
  altText: z.string().trim().optional(),
  kind: z.enum(["tour", "celebration"]).optional(),
  isFeatured: z.coerce.boolean().optional(),
  isActive: z.coerce.boolean().optional(),
  sortOrder: z.coerce.number().optional(),
});

export const homeCoverSchema = z.object({
  title: z.string().trim().optional(),
  isActive: z.coerce.boolean().optional(),
  sortOrder: z.coerce.number().optional(),
});

export const settingValueSchema = z.object({
  value: z.string(),
});
