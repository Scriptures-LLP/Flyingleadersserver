import { Schema, model } from "mongoose";

import { mysqlSyncFields } from "./shared/mysqlSyncFields.js";

const promoCodeSchema = new Schema(
  {
    ...mysqlSyncFields,

    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    tourId: { type: Schema.Types.ObjectId, ref: "Tour", default: null }, // null = applies to all tours
    type: { type: String, enum: ["percent", "amount"], required: true },
    value: { type: Number, required: true, min: 0 },
    maxDiscount: { type: Number, min: 0 },
    minCart: { type: Number, min: 0, default: 0 },
    usageLimit: { type: Number, min: 0 },
    perUserLimit: { type: Number, min: 0 },
    startsAt: { type: Date },
    expiresAt: { type: Date },
    isActive: { type: Boolean, default: true },
    note: { type: String, trim: true },
  },
  { timestamps: true },
);

export const PromoCode = model("PromoCode", promoCodeSchema);
