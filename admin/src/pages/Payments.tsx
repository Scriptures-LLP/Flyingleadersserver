import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { Pagination, usePagination } from "../components/Pagination";
import { api, apiErrorMessage } from "../lib/api";

type Transaction = {
  _id: string;
  bookingId?: { _id: string; bookingRef: string; tourId?: { title?: string } | string } | string;
  customerId?: { _id: string; name: string; email: string; phone?: string } | string;
  channel: "online" | "office";
  amount: number;
  type: "token" | "full" | "balance" | "custom" | "refund";
  createdAt: string;
  office?: { method: string; reference?: string; receivedAt: string; recordedBy?: { name: string } | string };
};

const TYPE_LABEL: Record<Transaction["type"], string> = {
  token: "Partial (token)",
  full: "Full payment",
  balance: "Balance payment",
  custom: "Custom amount",
  refund: "Refund",
};

const TABS = ["Today", "Yesterday", "All"] as const;

function tourTitle(b: Transaction["bookingId"]): string {
  if (!b || typeof b === "string") return "—";
  return typeof b.tourId === "object" && b.tourId ? (b.tourId.title ?? "—") : "—";
}

function bookingRef(b: Transaction["bookingId"]): string {
  if (!b) return "—";
  return typeof b === "string" ? b : b.bookingRef;
}

function customerName(c: Transaction["customerId"]): string {
  if (!c) return "—";
  return typeof c === "string" ? c : c.name;
}

function isSameDay(iso: string, d: Date): boolean {
  const t = new Date(iso);
  return t.toDateString() === d.toDateString();
}

export function PaymentsPage() {
  const { data: payments, isLoading, error } = useQuery({
    queryKey: ["/admin/payments"],
    queryFn: async () => (await api.get("/admin/payments")).data.items as Transaction[],
  });

  const [tab, setTab] = useState<(typeof TABS)[number]>("Today");

  const filtered = useMemo(() => {
    if (!payments) return [];
    if (tab === "All") return payments;
    const today = new Date();
    if (tab === "Today") return payments.filter((p) => isSameDay(p.createdAt, today));
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return payments.filter((p) => isSameDay(p.createdAt, yesterday));
  }, [payments, tab]);

  const pager = usePagination(filtered, 15, tab);

  return (
    <div>
      <div className="mb-5 flex items-center gap-2.5">
        <span className="h-6 w-1.5 rounded-full bg-gradient-to-b from-red-500 to-red-600" />
        <h1 className="text-xl font-bold tracking-tight text-neutral-900">Payments</h1>
      </div>
      <p className="mb-4 text-sm text-neutral-500">
        Every payment that's actually landed, across all app bookings — newest first. The latest 300 are kept here.
      </p>

      <div className="mb-4 flex gap-2">
        {TABS.map((tKey) => (
          <button
            key={tKey}
            onClick={() => setTab(tKey)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === tKey ? "bg-red-600 text-white" : "bg-white text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            {tKey}
            {tKey !== "All" && payments && (
              <span className="ml-1.5 opacity-70">
                ({payments.filter((p) => isSameDay(p.createdAt, tKey === "Today" ? new Date() : new Date(Date.now() - 86400000))).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-neutral-500">Loading…</p>}
      {error && <p className="text-red-600">{apiErrorMessage(error)}</p>}

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Booking</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Channel</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {pager.pageItems.map((p) => (
              <tr key={p._id}>
                <td className="whitespace-nowrap px-4 py-3 text-neutral-600">
                  {new Date(p.createdAt).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </td>
                <td className="px-4 py-3 text-neutral-800">
                  <p className="font-mono text-xs">{bookingRef(p.bookingId)}</p>
                  <p className="text-xs text-neutral-500">{tourTitle(p.bookingId)}</p>
                </td>
                <td className="px-4 py-3 text-neutral-800">{customerName(p.customerId)}</td>
                <td className="px-4 py-3 text-neutral-700">{TYPE_LABEL[p.type]}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-neutral-900">
                  ₹{p.amount.toLocaleString("en-IN")}
                </td>
                <td className="px-4 py-3 text-neutral-700">
                  {p.channel === "office" ? `Office · ${p.office?.method ?? "other"}` : "Online"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && !isLoading && (
          <p className="py-6 text-center text-neutral-400">No payments {tab === "All" ? "yet" : `for ${tab.toLowerCase()}`}.</p>
        )}
      </div>

      {pager.total > pager.pageSize && (
        <div className="mt-3 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          <Pagination
            page={pager.page}
            pageCount={pager.pageCount}
            total={pager.total}
            pageSize={pager.pageSize}
            onPage={pager.setPage}
            label="payments"
          />
        </div>
      )}
    </div>
  );
}
