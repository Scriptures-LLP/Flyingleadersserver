import { Schema, model } from "mongoose";

import { mysqlSyncFields } from "./shared/mysqlSyncFields.js";
import { uniqueSlug } from "../utils/slug.js";

const countrySchema = new Schema(
  {
    ...mysqlSyncFields,

    name: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, sparse: true },
    coverImage: { type: String },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

countrySchema.pre("validate", async function () {
  if (!this.slug) {
    this.slug = await uniqueSlug(Country, this.name, this.isNew ? undefined : this.id);
  }
});

export const Country = model("Country", countrySchema);
