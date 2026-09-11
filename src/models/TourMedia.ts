import { Schema, model } from "mongoose";

import { mysqlSyncFields } from "./shared/mysqlSyncFields.js";

const tourMediaSchema = new Schema(
  {
    ...mysqlSyncFields,

    tourId: { type: Schema.Types.ObjectId, ref: "Tour", required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: "MediaCategory", required: true },
    file: { type: String, required: true }, // our storage key, e.g. "tourMedia/<file>"
    title: { type: String, trim: true },
    alt: { type: String, trim: true },
    isPrimary: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

tourMediaSchema.index({ tourId: 1, categoryId: 1 });

export const TourMedia = model("TourMedia", tourMediaSchema);
