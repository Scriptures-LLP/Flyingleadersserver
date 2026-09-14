import { Schema, model } from "mongoose";

const travellerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    age: { type: Number, min: 0 },
    gender: { type: String, enum: ["male", "female", "other"] },
    type: { type: String, enum: ["adult", "child", "infant"], required: true, default: "adult" },
  },
  { _id: false },
);

const pricingSchema = new Schema(
  {
    baseAmount: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, required: true, min: 0, default: 0 },
    promoCode: { type: String, trim: true, uppercase: true },
    promoCodeId: { type: Schema.Types.ObjectId, ref: "PromoCode" },
    finalAmount: { type: Number, required: true, min: 0 },
    // The token (partial-payment) amount available for this booking, copied
    // from the tour at booking time — 0 if the tour doesn't allow it.
    tokenAmount: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false },
);

const bookingSchema = new Schema(
  {
    bookingRef: { type: String, required: true, unique: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    tourId: { type: Schema.Types.ObjectId, ref: "Tour", required: true },
    tourDateId: { type: Schema.Types.ObjectId, ref: "TourDate", default: null },
    airportId: { type: Schema.Types.ObjectId, ref: "Airport", default: null },
    travelDate: { type: Date, required: true },

    contactName: { type: String, required: true, trim: true },
    contactEmail: { type: String, required: true, trim: true, lowercase: true },
    contactPhone: { type: String, required: true, trim: true },

    travellers: { type: [travellerSchema], validate: (v: unknown[]) => v.length > 0 },
    pricing: { type: pricingSchema, required: true },

    // amountPaid is the running total actually captured via paid Transactions
    // — the source of truth for "how much has this customer really paid,"
    // independent of pricing.finalAmount (which can't change after booking).
    amountPaid: { type: Number, required: true, min: 0, default: 0 },

    status: {
      type: String,
      enum: ["pending_payment", "confirmed", "cancelled", "completed"],
      default: "pending_payment",
    },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "partial", "paid", "refund_initiated", "refunded"],
      default: "unpaid",
    },

    // Denormalized tour details at booking time, so a later tour edit can't
    // retroactively change what the customer actually booked/paid for.
    itinerarySnapshot: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

bookingSchema.index({ customerId: 1, createdAt: -1 });

export const Booking = model("Booking", bookingSchema);
