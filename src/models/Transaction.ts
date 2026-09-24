import { Schema, model } from "mongoose";

const refundSchema = new Schema(
  {
    razorpayRefundId: { type: String },
    amount: { type: Number, min: 0 },
    status: { type: String },
    initiatedBy: { type: Schema.Types.ObjectId, ref: "AdminUser" },
    reason: { type: String, trim: true },
    initiatedAt: { type: Date },
  },
  { _id: false },
);

// How an office (cash / UPI / bank) payment was taken. Recorded by an admin when
// a customer pays — or finishes paying — at the office instead of in the app.
export const OFFICE_PAYMENT_METHODS = ["cash", "upi", "bank_transfer", "card", "cheque", "other"] as const;

const officeSchema = new Schema(
  {
    method: { type: String, enum: OFFICE_PAYMENT_METHODS, required: true },
    // Receipt / UPI ref / cheque no. — whatever lets the office find it again.
    reference: { type: String, trim: true },
    // Internal only (never sent to the customer).
    note: { type: String, trim: true },
    // When the money was actually received, which can differ from when it was entered.
    receivedAt: { type: Date, required: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: "AdminUser" },
    // A wrongly-entered payment is voided, never deleted, so the books keep the trail.
    voidedAt: { type: Date },
    voidedBy: { type: Schema.Types.ObjectId, ref: "AdminUser" },
    voidReason: { type: String, trim: true },
  },
  { _id: false },
);

const transactionSchema = new Schema(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: "Booking", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },

    // "online" = paid through Razorpay in the app (the default, and what every
    // older row is); "office" = recorded by an admin, so it has no Razorpay ids.
    channel: { type: String, enum: ["online", "office"], default: "online" },

    razorpayOrderId: {
      type: String,
      index: true,
      required: function (this: { channel?: string }) {
        return this.channel !== "office";
      },
    },
    razorpayPaymentId: { type: String, sparse: true, index: true },
    razorpaySignature: { type: String },

    // Rupees, matching the rest of the app — converted to paise only at the
    // Razorpay API boundary (see razorpay.service.ts).
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR" },

    type: { type: String, enum: ["token", "full", "balance", "refund"], required: true },
    // "voided" only ever applies to an office payment that was entered by mistake.
    status: { type: String, enum: ["created", "paid", "failed", "refunded", "voided"], default: "created" },

    office: { type: officeSchema },
    refund: { type: refundSchema },
    rawWebhookPayload: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

export const Transaction = model("Transaction", transactionSchema);
