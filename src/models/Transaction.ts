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

const transactionSchema = new Schema(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: "Booking", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },

    razorpayOrderId: { type: String, required: true, index: true },
    razorpayPaymentId: { type: String, sparse: true, index: true },
    razorpaySignature: { type: String },

    // Rupees, matching the rest of the app — converted to paise only at the
    // Razorpay API boundary (see razorpay.service.ts).
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR" },

    type: { type: String, enum: ["token", "full", "refund"], required: true },
    status: { type: String, enum: ["created", "paid", "failed", "refunded"], default: "created" },

    refund: { type: refundSchema },
    rawWebhookPayload: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

export const Transaction = model("Transaction", transactionSchema);
