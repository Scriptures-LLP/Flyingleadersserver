import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api, apiErrorMessage } from "../lib/api";

type MysqlSync = {
  status?: "pending" | "synced" | "failed" | "disabled";
  lastError?: string;
  lastSyncedAt?: string;
};

const STYLE: Record<string, string> = {
  synced: "bg-green-50 text-green-700",
  pending: "bg-neutral-100 text-neutral-500",
  disabled: "bg-neutral-100 text-neutral-400",
  failed: "bg-red-50 text-red-700",
};

const LABEL: Record<string, string> = {
  synced: "Synced",
  pending: "Not synced yet",
  disabled: "Sync disabled",
  failed: "Sync failed",
};

/**
 * One cell: the live MySQL sync state of a Tour/Country/Airport/etc (module E —
 * the one-way sync that makes the legacy flyingdotcom site reflect admin edits).
 * A failed sync never blocks the Mongo save that triggered it, so without this
 * it's invisible to the admin that an edit never actually reached the website.
 */
export function SyncStatusCell({
  resourcePath,
  id,
  mysqlSync,
}: {
  resourcePath: string;
  id: string;
  mysqlSync?: MysqlSync;
}) {
  const queryClient = useQueryClient();
  const status = mysqlSync?.status ?? "pending";

  const retryMutation = useMutation({
    mutationFn: async () => api.post(`${resourcePath}/${id}/resync`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [resourcePath] }),
  });

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STYLE[status]}`}
        title={status === "failed" ? mysqlSync?.lastError : undefined}
      >
        {LABEL[status]}
      </span>
      {status === "failed" && (
        <button
          onClick={() => retryMutation.mutate()}
          disabled={retryMutation.isPending}
          className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
        >
          {retryMutation.isPending ? "Retrying…" : "Retry"}
        </button>
      )}
      {retryMutation.isError && (
        <span className="text-xs text-red-500">{apiErrorMessage(retryMutation.error)}</span>
      )}
    </div>
  );
}
