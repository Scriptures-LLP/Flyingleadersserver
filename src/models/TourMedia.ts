import { Schema, model } from "mongoose";

import { registerCacheInvalidation } from "../services/cache.service.js";

import { mysqlSyncFields } from "./shared/mysqlSyncFields.js";

const tourMediaSchema = new Schema(
  {
    ...mysqlSyncFields,

    tourId: { type: Schema.Types.ObjectId, ref: "Tour", required: true },
    // Optional: plain package gallery images don't belong to a MediaCategory
    // "folder" — the field is only set when the legacy media-library grouping
    // (Attractions/Hotels/…) is used. See MediaCategory.
    categoryId: { type: Schema.Types.ObjectId, ref: "MediaCategory" },
    file: { type: String, required: true }, // our storage key, e.g. "tourMedia/<file>"
    title: { type: String, trim: true },
    alt: { type: String, trim: true },
    isPrimary: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

tourMediaSchema.index({ tourId: 1, categoryId: 1 });

// Gallery images appear on the tour detail page.
registerCacheInvalidation(tourMediaSchema, ["tours"]);

export const TourMedia = model("TourMedia", tourMediaSchema);
