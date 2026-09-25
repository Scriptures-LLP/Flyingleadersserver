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
    // Referral wallet credit spent on this booking (already subtracted from
    // finalAmount above) — kept here purely for display/receipt purposes.
    walletCreditApplied: { type: Number, min: 0, default: 0 },
    // Per-traveller-type price breakdown at booking time (e.g. "2 adults @
    // Rs.X") — shown on the payment summary and carried onto the invoice/PDF
    // so it can't drift from what was actually charged. unitPrice is the final
    // per-person price: the tour's price for the type PLUS any airport /
    // travel-date charge ticked for that type. chargesIncluded is how much of
    // it came from those charges — for the admin's records; customers only see
    // unitPrice.
    breakdown: {
      type: [
        {
          _id: false,
          type: { type: String, enum: ["adult", "child", "infant"], required: true },
          count: { type: Number, required: true, min: 1 },
          unitPrice: { type: Number, required: true, min: 0 },
          chargesIncluded: { type: Number, min: 0, default: 0 },
          subtotal: { type: Number, required: true, min: 0 },
        },
      ],
      default: [],
    },
    // LEGACY. Bookings made before airport / date charges were folded into the
    // per-type prices carry them here as separate lines; new bookings leave this
    // empty. Kept so those older bookings still read correctly.
    addons: {
      type: [
        {
          _id: false,
          kind: { type: String, enum: ["airport", "date"], required: true },
          label: { type: String, required: true },
          count: { type: Number, required: true, min: 1 },
          unitPrice: { type: Number, required: true, min: 0 },
          subtotal: { type: Number, required: true, min: 0 },
        },
      ],
      default: [],
    },
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

    // Set when the booking is cancelled — by the office, or by a refund that
    // closes it — so the books show when and why, not just that status flipped.
    cancelledAt: { type: Date },
    cancellationReason: { type: String, trim: true },

    // While a booking that used a promo code is still unpaid, it *reserves*
    // one use of that code until this time (see promoUsage.service.ts) — so a
    // limited code can't be handed out to many unpaid bookings at once, yet an
    // abandoned booking frees the code again. Unused once money has been paid.
    promoHoldUntil: { type: Date },
    // true once a payment order has been opened for it: a payment is in
    // progress, so — unlike the soft hold made at creation — this reservation
    // can't be replaced by the same customer's other bookings.
    promoHoldFirm: { type: Boolean },

    // Denormalized tour details at booking time, so a later tour edit can't
    // retroactively change what the customer actually booked/paid for.
    itinerarySnapshot: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

bookingSchema.index({ customerId: 1, createdAt: -1 });
bookingSchema.index({ "pricing.promoCodeId": 1 });

export const Booking = model("Booking", bookingSchema);
