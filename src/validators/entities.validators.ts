import { z } from "zod";

import { zStrictBoolean } from "../utils/zodHelpers.js";

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
  isActive: zStrictBoolean.optional(),
  note: z.string().trim().optional(),
});

const tourDateBaseSchema = z.object({
  tourId: z.string().min(1),
  airportId: z.string().min(1).optional().nullable(),
  date: z.coerce.date(),
  // Optional: a date can be added with no price at all.
  price: z.coerce.number().min(0).optional(),
  // Flat fields (what an HTML form/FormData naturally submits) — reshaped
  // into the nested `appliesTo` the model actually stores.
  appliesToAdult: zStrictBoolean.optional(),
  appliesToChild: zStrictBoolean.optional(),
  appliesToInfant: zStrictBoolean.optional(),
  label: z.string().trim().optional(),
  isActive: zStrictBoolean.optional(),
  sortOrder: z.coerce.number().min(0).optional(),
});

function reshapeAppliesTo<T extends { appliesToAdult?: boolean; appliesToChild?: boolean; appliesToInfant?: boolean }>(
  v: T,
) {
  const { appliesToAdult, appliesToChild, appliesToInfant, ...rest } = v;
  // No price entered = applies to everyone by default, per spec. Once a
  // price exists, only the explicitly-checked types are charged for it.
  // Omit the key entirely when none were sent, rather than setting it to
  // undefined, so it doesn't get passed to Mongoose at all on updates.
  if (appliesToAdult === undefined && appliesToChild === undefined && appliesToInfant === undefined) {
    return rest;
  }
  return {
    ...rest,
    appliesTo: { adult: appliesToAdult ?? false, child: appliesToChild ?? false, infant: appliesToInfant ?? false },
  };
}

export const tourDateSchema = tourDateBaseSchema.transform(reshapeAppliesTo);
export const tourDateUpdateSchema = tourDateBaseSchema.partial().transform(reshapeAppliesTo);

export const tourAirportPriceSchema = z.object({
  tourId: z.string().min(1),
  airportId: z.string().min(1),
  // Optional: an airport can be added before its price is decided.
  addonPrice: z.coerce.number().min(0).optional(),
  isActive: zStrictBoolean.optional(),
});

export const galleryImageSchema = z.object({
  title: z.string().trim().optional(),
  altText: z.string().trim().optional(),
  kind: z.enum(["tour", "celebration"]).optional(),
  isFeatured: zStrictBoolean.optional(),
  isActive: zStrictBoolean.optional(),
  sortOrder: z.coerce.number().min(0).optional(),
});

export const homeCoverSchema = z.object({
  title: z.string().trim().optional(),
  isActive: zStrictBoolean.optional(),
  sortOrder: z.coerce.number().min(0).optional(),
});

export const settingValueSchema = z.object({
  value: z.string(),
});
