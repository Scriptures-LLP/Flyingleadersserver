/**
 * Spread into any Mongoose schema definition for a model that's mirrored into
 * flyingdotcom's legacy MySQL database (module E). `legacyMysqlId` links a
 * document to its MySQL row (set once migrated/first-synced, used to decide
 * INSERT vs UPDATE); `mysqlSync` tracks the outcome of the most recent sync
 * attempt without ever blocking the Mongo write that triggered it.
 */
export const mysqlSyncFields = {
  legacyMysqlId: { type: Number, index: true, sparse: true },
  mysqlSync: {
    status: {
      type: String,
      enum: ["pending", "synced", "failed", "disabled"],
      default: "pending",
    },
    lastAttemptAt: { type: Date },
    lastSyncedAt: { type: Date },
    lastError: { type: String },
  },
};

export type MysqlSyncStatus = {
  status: "pending" | "synced" | "failed" | "disabled";
  lastAttemptAt?: Date;
  lastSyncedAt?: Date;
  lastError?: string;
};
