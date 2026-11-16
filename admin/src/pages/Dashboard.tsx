import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { ScrollShadowBox } from "../components/ScrollShadowBox";
import { api, apiErrorMessage } from "../lib/api";

type Range = "today" | "7d" | "30d" | "all";

type RecentBooking = {
  _id: string;
  source: "app" | "website";
  ref: string | number;
  name: string;
  phone: string;
  tourTitle: string;
  travellers: number;
  bookedAt: string;
  amount: number;
  status: "Paid" | "Pending";
};

type DashboardSummary = {
  range: Range;
  rangeLabel: string;
  totalTours: number;
  activeTours: number;
  countries: number;
  bookingsAllTime: number;
  revenuePaid: number;
  recentBookings: RecentBooking[];
  traffic: { totalHits: number; totalUniques: number; todayHits: number; todayUniques: number };
};

const RANGE_TABS: { key: Range; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "all", label: "All" },
];

const STATUS_STYLE: Record<RecentBooking["status"], string> = {
  Paid: "bg-green-50 text-green-700",
  Pending: "bg-amber-50 text-amber-700",
};

function Kpi({ icon, label, value }: { icon: string; label: string; value: string | number }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="text-2xl">{icon}</div>
      <div>
        <div className="text-sm text-neutral-500">{label}</div>
        <div className="mt-1 text-2xl font-bold text-neutral-900">{value}</div>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const [range, setRange] = useState<Range>("today");

  const { data, isLoading, error } = useQuery({
    queryKey: ["/admin/dashboard", range],
    queryFn: async () => (await api.get("/admin/dashboard", { params: { range } })).data as DashboardSummary,
  });

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="h-6 w-1.5 rounded-full bg-gradient-to-b from-red-500 to-red-600" />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-neutral-900">Dashboard</h1>
            <p className="text-sm text-neutral-500">Quick snapshot · {data?.rangeLabel ?? "Today"}</p>
          </div>
        </div>

        <div className="inline-flex gap-1 rounded-xl border border-neutral-200 bg-white p-1 shadow-sm">
          {RANGE_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setRange(t.key)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
                range === t.key ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <p className="text-neutral-500">Loading…</p>}
      {error && <p className="text-red-600">{apiErrorMessage(error)}</p>}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Kpi icon="🗺️" label="Total Tours" value={data.totalTours} />
            <Kpi icon="✅" label="Active Tours" value={data.activeTours} />
            <Kpi icon="🌍" label="Countries" value={data.countries} />
            <Kpi icon="🧾" label="Bookings (All time)" value={data.bookingsAllTime.toLocaleString("en-IN")} />
            <Kpi
              icon="💰"
              label={`Revenue (Paid · ${data.rangeLabel})`}
              value={data.revenuePaid > 0 ? `₹${data.revenuePaid.toLocaleString("en-IN")}` : "—"}
            />
          </div>

          <div className="mt-8 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
            <div className="border-b border-neutral-200 p-4">
              <h2 className="text-lg font-semibold text-neutral-900">
                Recent Bookings <span className="font-normal text-neutral-400">({data.rangeLabel})</span>
              </h2>
              <p className="text-xs text-neutral-500">Showing latest {data.recentBookings.length} records</p>
            </div>

            <ScrollShadowBox>
              <table className="w-full text-left text-sm">
                <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-3">Ref</th>
                    <th className="whitespace-nowrap px-4 py-3">Booked</th>
                    <th className="whitespace-nowrap px-4 py-3">Tour</th>
                    <th className="whitespace-nowrap px-4 py-3">Customer</th>
                    <th className="whitespace-nowrap px-4 py-3">Status</th>
                    <th className="whitespace-nowrap px-4 py-3 text-right">Travellers</th>
                    <th className="whitespace-nowrap px-4 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {data.recentBookings.map((b) => (
                    <tr key={b._id}>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-neutral-700">
                        #{b.ref} <span className="ml-1 font-sans font-semibold text-neutral-400">[{b.source === "app" ? "App" : "Website"}]</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-neutral-600">
                        {new Date(b.bookedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                      </td>
                      <td className="px-4 py-3 text-neutral-800">
                        <div className="max-w-[220px] truncate" title={b.tourTitle}>{b.tourTitle}</div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="max-w-[160px] truncate font-medium text-neutral-800" title={b.name}>{b.name}</p>
                        <p className="max-w-[160px] truncate text-xs text-neutral-500" title={b.phone}>{b.phone}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[b.status]}`}>{b.status}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-700">{b.travellers}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-neutral-900">
                        ₹{b.amount.toLocaleString("en-IN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.recentBookings.length === 0 && <p className="py-6 text-center text-neutral-400">No bookings in this range.</p>}
            </ScrollShadowBox>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
              <div className="text-3xl">📈</div>
              <div>
                <div className="text-sm text-neutral-500">Total Website Hits</div>
                <div className="text-3xl font-extrabold text-neutral-900">{data.traffic.totalHits.toLocaleString("en-IN")}</div>
                <div className="mt-1 text-xs text-neutral-500">
                  Today: <span className="font-semibold text-neutral-700">{data.traffic.todayHits.toLocaleString("en-IN")}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
              <div className="text-3xl">🧑‍🤝‍🧑</div>
              <div>
                <div className="text-sm text-neutral-500">Total Unique Visitors</div>
                <div className="text-3xl font-extrabold text-neutral-900">{data.traffic.totalUniques.toLocaleString("en-IN")}</div>
                <div className="mt-1 text-xs text-neutral-500">
                  Today: <span className="font-semibold text-neutral-700">{data.traffic.todayUniques.toLocaleString("en-IN")}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
