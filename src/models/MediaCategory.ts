import { Schema, model } from "mongoose";

import { mysqlSyncFields } from "./shared/mysqlSyncFields.js";
import { uniqueSlug } from "../utils/slug.js";

// Mirrors legacy `media_categories` — folders that a Tour's gallery images
// (TourMedia) are organized into (e.g. "Attractions", "Hotels"). Distinct
// from the app-only `Category` model (Home screen chips: Beach/Mountains/...),
// which has no legacy MySQL equivalent and is never synced.
const mediaCategorySchema = new Schema(
  {
    ...mysqlSyncFields,

    name: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, sparse: true },
    // If true, uploading a new image in this category replaces (deletes) the previous one.
    isSingle: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

mediaCategorySchema.pre("validate", async function () {
  if (!this.slug) {
    this.slug = await uniqueSlug(MediaCategory, this.name, this.isNew ? undefined : this.id);
  }
});

export const MediaCategory = model("MediaCategory", mediaCategorySchema);
