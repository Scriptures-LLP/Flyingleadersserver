import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

import { Pagination, usePagination } from "../components/Pagination";
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

type Activity = { day: string; sessions: number; viewers: number; screenViews: number; installs: number };
type TopScreen = { screen: string; count: number };

type AppBlock = {
  bookingsAllTime: number;
  bookingsInRange: number;
  revenue: number;
  downloads: number;
  newInstalls: number;
  activeViewers: number;
  sessions: number;
  screenViews: number;
  registeredUsers: number;
  newUsers: number;
  platforms: { android: number; ios: number; web: number };
  topScreens: TopScreen[];
  activity: Activity[];
  recentBookings: RecentBooking[];
};

type WebsiteBlock = { bookingsAllTime: number; revenue: number; recentBookings: RecentBooking[] };

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
  website: WebsiteBlock;
  app: AppBlock;
};

const RANGE_TABS: { key: Range; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "all", label: "All time" },
];

const STATUS_STYLE: Record<RecentBooking["status"], string> = {
  Paid: "bg-green-50 text-green-700 ring-green-600/20",
  Pending: "bg-amber-50 text-amber-700 ring-amber-600/20",
};

const RED = "#dc2626";
const INK = "#262626";
const inr = (n: number) =>
  n >= 100000 ? `₹${(n / 100000).toFixed(n >= 1000000 ? 1 : 2)}L` : `₹${Math.round(n).toLocaleString("en-IN")}`;
const inrFull = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const num = (n: number) => n.toLocaleString("en-IN");
const sum = (arr: Activity[], k: keyof Activity) => arr.reduce((s, d) => s + (d[k] as number), 0);

function weeklyDelta(activity: Activity[], key: keyof Activity): { pct: number; up: boolean } | null {
  if (activity.length < 14) return null;
  const prev = activity.slice(0, 7).reduce((s, d) => s + (d[key] as number), 0);
  const curr = activity.slice(7).reduce((s, d) => s + (d[key] as number), 0);
  if (prev === 0 && curr === 0) return null;
  const pct = prev === 0 ? 100 : Math.round(((curr - prev) / prev) * 100);
  return { pct: Math.abs(pct), up: curr >= prev };
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-neutral-200/80 bg-white shadow-sm ${className}`}>{children}</div>;
}

function PanelHead({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 px-5 pb-1 pt-4">
      <h3 className="text-sm font-semibold text-neutral-800">{title}</h3>
      {right}
    </div>
  );
}

function TrendBadge({ delta }: { delta: { pct: number; up: boolean } | null }) {
  if (!delta) return null;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
        delta.up ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
      }`}
    >
      {delta.up ? "▲" : "▼"} {delta.pct}%
    </span>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  delta,
  accent,
}: {
  icon: string;
  label: string;
  value: string | number;
  sub?: string;
  delta?: { pct: number; up: boolean } | null;
  accent?: boolean;
}) {
  return (
    <Panel className="relative overflow-hidden p-5">
      {accent && <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-red-500/10 blur-2xl" />}
      <div className="flex items-start justify-between">
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl text-xl ${accent ? "bg-gradient-to-br from-red-500 to-red-600 shadow-sm shadow-red-600/30" : "bg-neutral-100"}`}>
          {icon}
        </div>
        {delta !== undefined && <TrendBadge delta={delta ?? null} />}
      </div>
      <div className="mt-4 text-[26px] font-bold leading-none tracking-tight text-neutral-900">{value}</div>
      <div className="mt-2 text-xs font-medium uppercase tracking-wide text-neutral-400">{label}</div>
      {sub && <div className="mt-0.5 text-xs text-neutral-400">{sub}</div>}
    </Panel>
  );
}

// Catmull-Rom → cubic bezier, for smooth chart lines.
function smoothLine(pts: [number, number][]): string {
  if (pts.length < 2) return pts.length ? `M ${pts[0][0]} ${pts[0][1]}` : "";
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

// Hero area chart: Sessions (filled) + Views (dashed), over the 14-day series.
function AreaChart({ activity }: { activity: Activity[] }) {
  const W = 620;
  const H = 210;
  const padT = 12;
  const padB = 26;
  const n = Math.max(activity.length, 2);
  const max = Math.max(1, ...activity.map((d) => Math.max(d.sessions, d.screenViews)));
  const xAt = (i: number) => (i / (n - 1)) * W;
  const yAt = (v: number) => padT + (1 - v / max) * (H - padT - padB);

  const sessPts = activity.map((d, i) => [xAt(i), yAt(d.sessions)] as [number, number]);
  const viewPts = activity.map((d, i) => [xAt(i), yAt(d.screenViews)] as [number, number]);
  const sessLine = smoothLine(sessPts);
  const area = `${sessLine} L ${W} ${H - padB} L 0 ${H - padB} Z`;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => padT + f * (H - padT - padB));

  return (
    <div className="px-2 pb-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[210px] w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={RED} stopOpacity="0.28" />
            <stop offset="100%" stopColor={RED} stopOpacity="0" />
          </linearGradient>
        </defs>
        {grid.map((y, i) => (
          <line key={i} x1="0" y1={y} x2={W} y2={y} stroke="#f0f0f0" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={area} fill="url(#areaFill)" />
        <path d={smoothLine(viewPts)} fill="none" stroke="#cbcbcb" strokeWidth="2" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
        <path d={sessLine} fill="none" stroke={RED} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
        {sessPts.length > 0 && (
          <circle cx={sessPts[sessPts.length - 1][0]} cy={sessPts[sessPts.length - 1][1]} r="3.5" fill={RED} stroke="#fff" strokeWidth="2" />
        )}
      </svg>
      <div className="flex justify-between px-1 text-[9px] tabular-nums text-neutral-400">
        {activity.map((d, i) => (
          <span key={d.day} className={i % 2 === 0 ? "" : "opacity-0"}>
            {d.day.slice(8, 10)}/{d.day.slice(5, 7)}
          </span>
        ))}
      </div>
    </div>
  );
}

// Radial gauge (open at the bottom) for a single rate/percentage.
function Gauge({ pct, label }: { pct: number; label: string }) {
  const cx = 80;
  const cy = 80;
  const r = 62;
  const START = -135;
  const SPAN = 270;
  const clamped = Math.max(0, Math.min(100, pct));
  const polar = (a: number) => {
    const rad = ((a - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const arc = (from: number, to: number) => {
    const [sx, sy] = polar(to);
    const [ex, ey] = polar(from);
    const large = to - from <= 180 ? 0 : 1;
    return `M ${sx.toFixed(1)} ${sy.toFixed(1)} A ${r} ${r} 0 ${large} 0 ${ex.toFixed(1)} ${ey.toFixed(1)}`;
  };
  const valueAngle = START + (clamped / 100) * SPAN;

  return (
    <div className="relative mx-auto" style={{ width: 160, height: 150 }}>
      <svg viewBox="0 0 160 160" className="h-full w-full">
        <defs>
          <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f87171" />
            <stop offset="100%" stopColor={RED} />
          </linearGradient>
        </defs>
        <path d={arc(START, START + SPAN)} fill="none" stroke="#f1f1f1" strokeWidth="14" strokeLinecap="round" />
        {clamped > 0 && <path d={arc(START, valueAngle)} fill="none" stroke="url(#gaugeGrad)" strokeWidth="14" strokeLinecap="round" />}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pb-3">
        <span className="text-3xl font-bold text-neutral-900">{Math.round(clamped)}%</span>
        <span className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-neutral-400">{label}</span>
      </div>
    </div>
  );
}

function Donut({
  segments,
  centerValue,
  centerLabel,
  size = 150,
}: {
  segments: { label: string; value: number; color: string }[];
  centerValue: string;
  centerLabel: string;
  size?: number;
}) {
  const active = segments.filter((s) => s.value > 0);
  const total = active.reduce((s, x) => s + x.value, 0);
  const R = 52;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
          <circle cx="70" cy="70" r={R} fill="none" stroke="#f3f3f3" strokeWidth="14" />
          {total > 0 &&
            active.map((s) => {
              const len = (s.value / total) * C;
              const el = (
                <circle key={s.label} cx="70" cy="70" r={R} fill="none" stroke={s.color} strokeWidth="14" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} strokeLinecap="butt" />
              );
              offset += len;
              return el;
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-neutral-900">{centerValue}</span>
          <span className="text-[10px] uppercase tracking-wide text-neutral-400">{centerLabel}</span>
        </div>
      </div>
      <div className="w-full space-y-2">
        {active.length === 0 && <p className="text-center text-sm text-neutral-400">No data yet.</p>}
        {active.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="text-neutral-600">{s.label}</span>
            <span className="ml-auto font-semibold text-neutral-900">{num(s.value)}</span>
            <span className="w-9 text-right text-xs text-neutral-400">{total > 0 ? Math.round((s.value / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Ranked horizontal-bar list (Active-User / Traffic-Sources style).
function BarList({ rows, emptyLabel }: { rows: { label: string; value: number; display?: string }[]; emptyLabel: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0 || max === 1) {
    if (rows.every((r) => r.value === 0)) return <p className="px-5 py-10 text-center text-sm text-neutral-400">{emptyLabel}</p>;
  }
  return (
    <div className="space-y-3 px-5 py-4">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="truncate text-neutral-600" title={r.label}>{r.label}</span>
            <span className="font-semibold tabular-nums text-neutral-900">{r.display ?? num(r.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
            <div className="h-full rounded-full bg-gradient-to-r from-red-500 to-red-600" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Descending funnel (Conversion-Rate style).
function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <div className="space-y-3.5 px-5 py-4">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].value : null;
        const conv = prev && prev > 0 ? Math.round((s.value / prev) * 100) : null;
        return (
          <div key={s.label}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-neutral-600">{s.label}</span>
              <span className="flex items-center gap-2">
                {conv !== null && <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-500">{conv}%</span>}
                <span className="font-semibold tabular-nums text-neutral-900">{num(s.value)}</span>
              </span>
            </div>
            <div className="h-6 overflow-hidden rounded-lg bg-neutral-100">
              <div
                className="flex h-full items-center rounded-lg bg-gradient-to-r from-red-500 to-red-600"
                style={{ width: `${Math.max((s.value / max) * 100, s.value > 0 ? 6 : 0)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const searchInput =
  "h-9 w-full rounded-lg border border-neutral-200 pl-8 pr-3 text-sm placeholder:text-neutral-400 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-500/20";
const selectInput =
  "h-9 rounded-lg border border-neutral-200 bg-white px-2.5 text-sm text-neutral-700 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-500/20";

function FilterableBookingsTable({ bookings, emptyLabel, label }: { bookings: RecentBooking[]; emptyLabel: string; label: string }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "Paid" | "Pending">("all");
  const filtered = bookings.filter((b) => {
    if (status !== "all" && b.status !== status) return false;
    if (!q.trim()) return true;
    const t = q.trim().toLowerCase();
    return [b.name, b.tourTitle, String(b.ref), b.phone].some((v) => v?.toLowerCase().includes(t));
  });
  const pager = usePagination(filtered, 6, q + status);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-neutral-50/60 px-4 py-2.5">
        <div className="relative min-w-[180px] flex-1">
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input className={searchInput} placeholder="Search name, tour, ref, phone…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className={selectInput} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="all">All statuses</option>
          <option value="Paid">Paid</option>
          <option value="Pending">Pending</option>
        </select>
      </div>

      <ScrollShadowBox>
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="whitespace-nowrap px-4 py-3">Ref</th>
              <th className="whitespace-nowrap px-4 py-3">Booked</th>
              <th className="whitespace-nowrap px-4 py-3">Tour</th>
              <th className="whitespace-nowrap px-4 py-3">Customer</th>
              <th className="whitespace-nowrap px-4 py-3">Status</th>
              <th className="whitespace-nowrap px-4 py-3 text-right">Pax</th>
              <th className="whitespace-nowrap px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {pager.pageItems.map((b) => (
              <tr key={b._id} className="hover:bg-neutral-50">
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-neutral-700">#{b.ref}</td>
                <td className="whitespace-nowrap px-4 py-3 text-neutral-600">
                  {new Date(b.bookedAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "2-digit" })}
                </td>
                <td className="px-4 py-3 text-neutral-800">
                  <div className="max-w-[200px] truncate" title={b.tourTitle}>{b.tourTitle}</div>
                </td>
                <td className="px-4 py-3">
                  <p className="max-w-[150px] truncate font-medium text-neutral-800" title={b.name}>{b.name}</p>
                  <p className="max-w-[150px] truncate text-xs text-neutral-500" title={b.phone}>{b.phone}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLE[b.status]}`}>{b.status}</span>
                </td>
                <td className="px-4 py-3 text-right text-neutral-700">{b.travellers}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-neutral-900">{inrFull(b.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="py-10 text-center text-neutral-400">{bookings.length === 0 ? emptyLabel : "No bookings match your filters."}</p>}
      </ScrollShadowBox>
      <Pagination {...pager} onPage={pager.setPage} label={label} />
    </div>
  );
}

function SectionHeader({ icon, title, subtitle, accent }: { icon: string; title: string; subtitle: string; accent: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className={`flex h-11 w-11 items-center justify-center rounded-2xl text-xl text-white shadow-sm ${accent}`}>{icon}</div>
      <div>
        <h2 className="text-lg font-bold tracking-tight text-neutral-900">{title}</h2>
        <p className="text-sm text-neutral-500">{subtitle}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function DashboardPage() {
  const [range, setRange] = useState<Range>("7d");

  const { data, isLoading, error } = useQuery({
    queryKey: ["/admin/dashboard", range],
    queryFn: async () => (await api.get("/admin/dashboard", { params: { range } })).data as DashboardSummary,
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="h-6 w-1.5 rounded-full bg-gradient-to-b from-red-500 to-red-600" />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-neutral-900">Dashboard</h1>
            <p className="text-sm text-neutral-500">App & website performance · {data?.rangeLabel ?? "…"}</p>
          </div>
        </div>
        <div className="inline-flex gap-1 rounded-xl border border-neutral-200 bg-white p-1 shadow-sm">
          {RANGE_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setRange(t.key)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
                range === t.key ? "bg-neutral-900 text-white shadow-sm" : "text-neutral-600 hover:bg-neutral-100"
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
        <div className="space-y-6">
          {/* ===== Overview grid ===== */}
          <div className="grid gap-5 lg:grid-cols-3">
            {/* Left two-thirds */}
            <div className="space-y-5 lg:col-span-2">
              <div className="grid gap-5 sm:grid-cols-3">
                <StatCard icon="💰" label={`Revenue · ${data.rangeLabel}`} value={data.revenuePaid > 0 ? inr(data.revenuePaid) : "—"} sub="App + Website" accent />
                <StatCard icon="🧾" label="Total Bookings" value={num(data.bookingsAllTime)} sub="all-time" delta={weeklyDelta(data.app.activity, "sessions")} />
                <StatCard icon="📱" label="App Downloads" value={num(data.app.downloads)} sub={`+${num(data.app.newInstalls)} ${data.rangeLabel.toLowerCase()}`} delta={weeklyDelta(data.app.activity, "installs")} />
              </div>

              <div className="grid gap-5 sm:grid-cols-3">
                <Panel className="sm:col-span-2">
                  <PanelHead
                    title="Activity Analytics"
                    right={
                      <div className="flex items-center gap-3 text-xs">
                        <span className="inline-flex items-center gap-1.5 text-neutral-500">
                          <span className="h-2 w-2.5 rounded-sm" style={{ backgroundColor: RED }} /> Sessions
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-neutral-400">
                          <span className="h-0.5 w-3 rounded-sm bg-neutral-300" /> Views
                        </span>
                      </div>
                    }
                  />
                  <div className="flex items-center gap-4 px-5 pb-1 text-xs text-neutral-400">
                    <span>This week <b className="text-neutral-800">{num(sum(data.app.activity.slice(7), "sessions"))}</b> sessions</span>
                    <span>·</span>
                    <span><b className="text-neutral-800">{num(sum(data.app.activity.slice(7), "screenViews"))}</b> views</span>
                  </div>
                  <AreaChart activity={data.app.activity} />
                </Panel>

                <Panel>
                  <PanelHead title="Active Rate" />
                  <div className="px-5 pb-2 pt-2">
                    <Gauge pct={data.app.downloads > 0 ? (data.app.activeViewers / data.app.downloads) * 100 : 0} label="active" />
                  </div>
                  <div className="grid grid-cols-2 gap-2 border-t border-neutral-100 px-5 py-3 text-center">
                    <div>
                      <div className="text-base font-bold text-neutral-900">{num(data.app.downloads)}</div>
                      <div className="text-[10px] uppercase tracking-wide text-neutral-400">Installs</div>
                    </div>
                    <div>
                      <div className="text-base font-bold text-neutral-900">{num(data.app.activeViewers)}</div>
                      <div className="text-[10px] uppercase tracking-wide text-neutral-400">Active</div>
                    </div>
                  </div>
                </Panel>
              </div>
            </div>

            {/* Right third — source donut (tall) */}
            <Panel className="flex flex-col">
              <PanelHead title="Bookings by Source" right={<span className="text-xs text-neutral-400">all-time</span>} />
              <div className="flex flex-1 flex-col justify-center px-5 pb-5 pt-3">
                <Donut
                  size={168}
                  centerValue={num(data.app.bookingsAllTime + data.website.bookingsAllTime)}
                  centerLabel="bookings"
                  segments={[
                    { label: "📱 App", value: data.app.bookingsAllTime, color: RED },
                    { label: "🌐 Website", value: data.website.bookingsAllTime, color: INK },
                  ]}
                />
                <div className="mt-5 grid grid-cols-2 gap-3 border-t border-neutral-100 pt-4 text-center">
                  <div>
                    <div className="text-sm font-bold text-neutral-900">{inr(data.app.revenue)}</div>
                    <div className="text-[10px] uppercase tracking-wide text-neutral-400">App revenue</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-neutral-900">{inr(data.website.revenue)}</div>
                    <div className="text-[10px] uppercase tracking-wide text-neutral-400">Web revenue</div>
                  </div>
                </div>
              </div>
            </Panel>
          </div>

          {/* ===== Insight row ===== */}
          <div className="grid gap-5 lg:grid-cols-3">
            <Panel>
              <PanelHead title="Top Screens" right={<span className="text-xs text-neutral-400">by views</span>} />
              <BarList
                emptyLabel="No screen activity yet."
                rows={data.app.topScreens.slice(0, 6).map((s) => ({ label: s.screen, value: s.count }))}
              />
            </Panel>

            <Panel>
              <PanelHead title="Conversion Funnel" right={<span className="text-xs text-neutral-400">{data.rangeLabel}</span>} />
              <Funnel
                steps={[
                  { label: "Downloads", value: data.app.downloads },
                  { label: "Active Viewers", value: data.app.activeViewers },
                  { label: "App Bookings", value: data.app.bookingsInRange },
                ]}
              />
            </Panel>

            <Panel>
              <PanelHead title="Installs by Platform" />
              <BarList
                emptyLabel="No device data yet."
                rows={(() => {
                  const p = data.app.platforms;
                  const tot = Math.max(1, p.android + p.ios + p.web);
                  return [
                    { label: "Android", value: p.android, display: `${Math.round((p.android / tot) * 100)}%` },
                    { label: "iOS", value: p.ios, display: `${Math.round((p.ios / tot) * 100)}%` },
                    { label: "Web", value: p.web, display: `${Math.round((p.web / tot) * 100)}%` },
                  ];
                })()}
              />
            </Panel>
          </div>

          {/* ===== App bookings ===== */}
          <section>
            <SectionHeader icon="📱" title="Flying Leader App" subtitle="Mobile bookings" accent="bg-gradient-to-br from-red-500 to-red-600 shadow-red-600/30" />
            <Panel className="overflow-hidden">
              <PanelHead title="App Bookings" right={<span className="text-xs text-neutral-400">{num(data.app.recentBookings.length)} recent</span>} />
              <div className="pt-2">
                <FilterableBookingsTable bookings={data.app.recentBookings} emptyLabel="No app bookings in this range." label="app bookings" />
              </div>
            </Panel>
          </section>

          {/* ===== Website ===== */}
          <section>
            <SectionHeader icon="🌐" title="Website" subtitle="flyingleader.com bookings & traffic" accent="bg-gradient-to-br from-neutral-700 to-neutral-900 shadow-neutral-900/30" />
            <div className="grid gap-5 lg:grid-cols-3">
              <div className="grid gap-5 sm:grid-cols-2 lg:col-span-2">
                <StatCard icon="🧾" label="Website Bookings" value={num(data.website.bookingsAllTime)} sub="all-time" />
                <StatCard icon="💰" label="Website Revenue" value={data.website.revenue > 0 ? inr(data.website.revenue) : "—"} sub={data.rangeLabel} />
                <StatCard icon="📈" label="Total Site Hits" value={num(data.traffic.totalHits)} sub={`${num(data.traffic.todayHits)} today`} />
                <StatCard icon="🧑‍🤝‍🧑" label="Unique Visitors" value={num(data.traffic.totalUniques)} sub={`${num(data.traffic.todayUniques)} today`} />
              </div>
              <Panel className="flex flex-col">
                <PanelHead title="Visitor Engagement" />
                <div className="flex flex-1 items-center px-5 pb-5 pt-3">
                  <Donut
                    size={150}
                    centerValue={num(data.traffic.totalHits)}
                    centerLabel="hits"
                    segments={[
                      { label: "Unique visitors", value: data.traffic.totalUniques, color: RED },
                      { label: "Return hits", value: Math.max(0, data.traffic.totalHits - data.traffic.totalUniques), color: INK },
                    ]}
                  />
                </div>
              </Panel>
            </div>

            <div className="mt-5">
              <Panel className="overflow-hidden">
                <PanelHead title="Website Bookings" right={<span className="text-xs text-neutral-400">{num(data.website.recentBookings.length)} recent</span>} />
                <div className="pt-2">
                  <FilterableBookingsTable bookings={data.website.recentBookings} emptyLabel="No website bookings in this range." label="website bookings" />
                </div>
              </Panel>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
