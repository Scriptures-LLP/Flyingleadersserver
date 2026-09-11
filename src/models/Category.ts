import { Schema, model } from "mongoose";

import { uniqueSlug } from "../utils/slug.js";

const categorySchema = new Schema(
  {
    label: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, sparse: true },
    image: { type: String },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

categorySchema.pre("validate", async function () {
  if (!this.slug) {
    this.slug = await uniqueSlug(Category, this.label, this.isNew ? undefined : this.id);
  }
});

export const Category = model("Category", categorySchema);
