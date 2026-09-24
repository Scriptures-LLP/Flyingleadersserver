import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api, apiErrorMessage } from "../lib/api";
import { Pagination, usePagination } from "../components/Pagination";

type Review = {
  _id: string;
  tourId?: { _id: string; title: string } | string;
  customerId?: { _id: string; name: string; email: string } | string;
  rating: number;
  title?: string;
  comment: string;
  status: "pending" | "approved" | "rejected";
  moderationNote?: string;
  createdAt: string;
};

const TABS: { key: Review["status"] | "all"; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

const STATUS_STYLE: Record<Review["status"], string> = {
  pending: "bg-red-50 text-red-700",
  approved: "bg-green-50 text-green-700",
  rejected: "bg-neutral-100 text-neutral-500",
};

function name(v: Review["tourId"] | Review["customerId"]): string {
  if (!v) return "—";
  if (typeof v === "string") return v;
  return "title" in v ? v.title : v.name;
}

export function ReviewsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("pending");

  const { data: reviews, isLoading, error } = useQuery({
    queryKey: ["/admin/reviews", tab],
    queryFn: async () =>
      (await api.get("/admin/reviews", { params: tab === "all" ? {} : { status: tab } })).data.items as Review[],
  });

  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const pager = usePagination(reviews, 6, tab);

  const moderateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) =>
      api.patch(`/admin/reviews/${id}`, { status, moderationNote: noteDraft[id] }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/admin/reviews"] }),
  });

  return (
    <div>
      <div className="mb-5 flex items-center gap-2.5">
        <span className="h-6 w-1.5 rounded-full bg-gradient-to-b from-red-500 to-red-600" />
        <h1 className="text-xl font-bold tracking-tight text-neutral-900">Reviews &amp; Ratings</h1>
      </div>

      <div className="mb-4 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === t.key ? "bg-red-600 text-white" : "bg-white text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-neutral-500">Loading…</p>}
      {error && <p className="text-red-600">{apiErrorMessage(error)}</p>}

      <div className="flex flex-col gap-3">
        {pager.pageItems.map((r) => (
          <div key={r._id} className="rounded-xl border border-neutral-200 bg-white shadow-sm p-4">
            <div className="mb-1 flex items-start justify-between">
              <div>
                <p className="font-medium text-neutral-900">{name(r.tourId)}</p>
                <p className="text-xs text-neutral-500">
                  {name(r.customerId)} · {new Date(r.createdAt).toLocaleDateString("en-IN")}
                </p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>
                {r.status}
              </span>
            </div>
            <p className="mb-1 text-red-500">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</p>
            {r.title && <p className="font-medium text-neutral-800">{r.title}</p>}
            <p className="text-sm text-neutral-700">{r.comment}</p>

            {r.status === "pending" && (
              <div className="mt-3 flex items-center gap-2">
                <input
                  placeholder="Moderation note (optional)"
                  className="input"
                  value={noteDraft[r._id] ?? ""}
                  onChange={(e) => setNoteDraft((d) => ({ ...d, [r._id]: e.target.value }))}
                />
                <button
                  onClick={() => moderateMutation.mutate({ id: r._id, status: "approved" })}
                  disabled={moderateMutation.isPending}
                  className="shrink-0 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={() => moderateMutation.mutate({ id: r._id, status: "rejected" })}
                  disabled={moderateMutation.isPending}
                  className="shrink-0 rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            )}
            {r.moderationNote && <p className="mt-2 text-xs text-neutral-500">Note: {r.moderationNote}</p>}
          </div>
        ))}
        {reviews?.length === 0 && <p className="py-6 text-center text-neutral-400">Nothing here yet.</p>}
      </div>

      {pager.total > pager.pageSize && (
        <div className="mt-3 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          <Pagination
            page={pager.page}
            pageCount={pager.pageCount}
            total={pager.total}
            pageSize={pager.pageSize}
            onPage={pager.setPage}
            label="reviews"
          />
        </div>
      )}
    </div>
  );
}
