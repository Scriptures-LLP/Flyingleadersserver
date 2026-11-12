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
 * in the database via the helpers above. Callers never await this (see each call site) —
 * the legacy MySQL host is a remote, sometimes-slow network round trip, and the admin
 * request this was triggered from must respond as soon as Mongo's own write (the real
 * source of truth) has succeeded, not wait on a second system on top of it. Because of
 * that, the in-memory `doc` passed in may already be serialized into a response before
 * this finishes — status/legacyMysqlId mutations on it are a best-effort courtesy for a
 * caller that happens to read `doc` again later in the same tick, not something a
 * response can rely on; the real outcome always lands in Mongo for the next fetch to see.
 * Never rejects — a sync failure (including a failure to even *record* the failure) must
 * never surface as an unhandled rejection off of a call nobody is awaiting.
 */
export async function runMysqlSync(model: Model<any>, doc: SyncableDoc, syncFn: () => Promise<number | void>) {
  try {
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
  } catch (err) {
    console.error(`[mysql-sync] could not even record the outcome for ${model.modelName} ${doc._id}:`, describeError(err));
  }
}
