import { z } from "zod";

import { zStrictBoolean } from "../utils/zodHelpers.js";

export const addressSchema = z.object({
  label: z.string().trim().min(1).optional(),
  line1: z.string().trim().min(1),
  line2: z.string().trim().optional(),
  city: z.string().trim().min(1),
  state: z.string().trim().optional(),
  postalCode: z.string().trim().min(1),
  country: z.string().trim().optional(),
  isDefault: zStrictBoolean.optional(),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().max(20).optional(),
  address: z.string().trim().max(300).optional(),
  notificationPreferences: z
    .object({
      bookingUpdates: z.boolean().optional(),
      promotions: z.boolean().optional(),
      tripReminders: z.boolean().optional(),
    })
    .optional(),
  languagePreference: z.enum(["en", "hi"]).optional(),
});

export const idParamSchema = z.object({ id: z.string().min(1) });
