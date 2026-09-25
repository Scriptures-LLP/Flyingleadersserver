import { z } from "zod";

import { OFFICE_PAYMENT_METHODS } from "../models/Transaction.js";
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
  // A refund normally ends the booking: it moves to Cancelled and its seats go
  // back on sale. Send false only to refund part of the money and keep the trip.
  cancelBooking: z.boolean().optional(),
});

export const cancelBookingSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});

export const idParamSchema = z.object({ id: z.string().min(1) });

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");

export const listMyPaymentsQuerySchema = z.object({ bookingId: objectId.optional() });

// A payment the customer made at the office rather than in the app. Amounts are
// whole rupees or rupees.paise; the date can't be in the future (a receipt
// dated tomorrow is a typo, not a payment).
export const recordOfficePaymentSchema = z.object({
  amount: z.coerce
    .number()
    .positive("Enter an amount greater than 0")
    .max(10_000_000)
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "Use at most 2 decimal places"),
  method: z.enum(OFFICE_PAYMENT_METHODS),
  reference: z.string().trim().max(100).optional(),
  note: z.string().trim().max(300).optional(),
  receivedAt: z.coerce
    .date()
    .refine((d) => d.getTime() <= Date.now() + 5 * 60_000, "The received date can't be in the future")
    .optional(),
});

export const voidOfficePaymentSchema = z.object({
  reason: z.string().trim().min(3, "Tell us why (at least 3 characters)").max(300),
});

export const bookingTransactionParamSchema = z.object({ id: objectId, txnId: objectId });
