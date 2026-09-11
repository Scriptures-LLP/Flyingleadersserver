import { Schema, model } from "mongoose";

// Mirrors legacy `settings` (k/v store, PK is the key itself — no
// auto-increment id, so no legacyMysqlId here unlike other synced models).
const settingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: String, required: true },
    mysqlSync: {
      status: { type: String, enum: ["pending", "synced", "failed", "disabled"], default: "pending" },
      lastAttemptAt: { type: Date },
      lastSyncedAt: { type: Date },
      lastError: { type: String },
    },
  },
  { timestamps: true },
);

export const Setting = model("Setting", settingSchema);
