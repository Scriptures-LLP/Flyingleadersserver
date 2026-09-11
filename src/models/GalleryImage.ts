import { Schema, model } from "mongoose";

import { mysqlSyncFields } from "./shared/mysqlSyncFields.js";

const galleryImageSchema = new Schema(
  {
    ...mysqlSyncFields,

    title: { type: String, trim: true },
    altText: { type: String, trim: true },
    file: { type: String, required: true }, // our storage key, e.g. "gallery/<file>"
    kind: { type: String, enum: ["tour", "celebration"], default: "tour" },
    isFeatured: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const GalleryImage = model("GalleryImage", galleryImageSchema);
