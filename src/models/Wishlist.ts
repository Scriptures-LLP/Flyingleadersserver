import { Schema, model } from "mongoose";

const wishlistSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    tourId: { type: Schema.Types.ObjectId, ref: "Tour", required: true },
  },
  { timestamps: true },
);

wishlistSchema.index({ customerId: 1, tourId: 1 }, { unique: true });

export const Wishlist = model("Wishlist", wishlistSchema);
