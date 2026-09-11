import { Schema, model } from "mongoose";

import { mysqlSyncFields } from "./shared/mysqlSyncFields.js";

const homeCoverSchema = new Schema(
  {
    ...mysqlSyncFields,

    image: { type: String, required: true }, // our storage key, e.g. "homeCovers/<file>"
    title: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const HomeCover = model("HomeCover", homeCoverSchema);
