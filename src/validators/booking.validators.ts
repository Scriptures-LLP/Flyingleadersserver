import { z } from "zod";

import { zStrictBoolean } from "../utils/zodHelpers.js";

const travellerSchema = z.object({
  name: z.string().trim().min(1),
  age: z.coerce.number().min(0).optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
  type: z.enum(["adult", "child", "infant"]).default("adult"),
});

export const createBookingSchema = z.object({
  tourId: z.string().min(1),
  tourDateId: z.string().min(1).optional(),
  airportId: z.string().min(1).optional(),
  travelDate: z.coerce.date(),
  contactName: z.string().trim().min(1),
  contactEmail: z.string().trim().email(),
  contactPhone: z.string().trim().min(1),
  travellers: z.array(travellerSchema).min(1),
  promoCode: z.string().trim().min(1).optional(),
  useWalletCredit: zStrictBoolean.optional(),
});

export const createPaymentOrderSchema = z.object({
  bookingId: z.string().min(1),
  mode: z.enum(["full", "token", "balance"]),
});

export const reconcilePaymentSchema = z.object({ bookingId: z.string().min(1) });

export const verifyPaymentSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("success"),
    bookingId: z.string().min(1),
    razorpay_order_id: z.string().min(1),
    razorpay_payment_id: z.string().min(1),
    razorpay_signature: z.string().min(1),
  }),
  z.object({
    status: z.literal("failed"),
    bookingId: z.string().min(1),
    razorpay_order_id: z.string().min(1).optional(),
  }),
]);

export const refundBookingSchema = z.object({
  amount: z.coerce.number().min(0).optional(),
  reason: z.string().trim().optional(),
});

export const idParamSchema = z.object({ id: z.string().min(1) });
