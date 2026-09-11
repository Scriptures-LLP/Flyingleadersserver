import type { Model, Types } from "mongoose";

import { env } from "../config/env.js";

/** mysql2 connection errors (and AggregateErrors from Node's dual-stack DNS lookups) often carry a useful `.code` (e.g. ECONNREFUSED) with an empty `.message`. */
function describeError(err: unknown): string {
  if (err instanceof AggregateError && err.errors?.length) {
    return err.errors.map(describeError).join("; ");
  }
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    return err.message || code || err.toString();
  }
  return String(err);
}

/**
 * Records the outcome of a sync attempt directly via updateOne — never through
 * the model's normal save path, so this can never re-trigger the sync it's
 * recording the result of.
 */
export async function recordSyncSuccess(
  model: Model<any>,
  id: Types.ObjectId | string,
  legacyMysqlId?: number,
) {
  const now = new Date();
  await model.updateOne(
    { _id: id },
    {
      $set: {
        "mysqlSync.status": "synced",
        "mysqlSync.lastAttemptAt": now,
        "mysqlSync.lastSyncedAt": now,
        ...(legacyMysqlId ? { legacyMysqlId } : {}),
      },
      // $set can't clear a field (MongoDB drops `undefined` values silently) — unset it instead.
      $unset: { "mysqlSync.lastError": "" },
    },
  );
}

export async function recordSyncFailure(model: Model<any>, id: Types.ObjectId | string, err: unknown) {
  const message = describeError(err);
  await model.updateOne(
    { _id: id },
    {
      $set: {
        "mysqlSync.status": "failed",
        "mysqlSync.lastAttemptAt": new Date(),
        "mysqlSync.lastError": message.slice(0, 500),
      },
    },
  );
  console.error(`[mysql-sync] failed for ${model.modelName} ${id}:`, message);
}

export async function recordSyncDisabled(model: Model<any>, id: Types.ObjectId | string) {
  if (env.MYSQL_SYNC_ENABLED) return;
  await model.updateOne({ _id: id }, { $set: { "mysqlSync.status": "disabled" } });
}

type SyncableDoc = {
  _id: Types.ObjectId | string;
  legacyMysqlId?: number | null;
  mysqlSync?: {
    status: string;
    lastAttemptAt?: Date | null;
    lastSyncedAt?: Date | null;
    lastError?: string | null;
  } | null;
};

/**
 * Runs a sync upsert/delete for one document, recording pending/disabled/success/failure
 * both in the database (via the helpers above) AND on the in-memory `doc` itself, so a
 * response serialized right after this call reflects the real outcome rather than the
 * stale pre-sync state. Never throws — a sync failure must never fail the admin request
 * that triggered it (Mongo already has the source-of-truth write). `syncFn` returns the
 * legacy row's numeric id (new or existing) on success.
 */
export async function runMysqlSync(model: Model<any>, doc: SyncableDoc, syncFn: () => Promise<number | void>) {
  if (!env.MYSQL_SYNC_ENABLED) {
    doc.mysqlSync = { ...doc.mysqlSync, status: "disabled" };
    await recordSyncDisabled(model, doc._id);
    return;
  }
  try {
    const legacyMysqlId = await syncFn();
    const now = new Date();
    doc.mysqlSync = { status: "synced", lastAttemptAt: now, lastSyncedAt: now };
    if (legacyMysqlId) doc.legacyMysqlId = legacyMysqlId;
    await recordSyncSuccess(model, doc._id, legacyMysqlId ?? undefined);
  } catch (err) {
    const message = describeError(err);
    doc.mysqlSync = { ...doc.mysqlSync, status: "failed", lastAttemptAt: new Date(), lastError: message.slice(0, 500) };
    await recordSyncFailure(model, doc._id, err);
  }
}
