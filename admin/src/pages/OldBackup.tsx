import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Pagination, usePagination } from "../components/Pagination";
import { ScrollShadowBox } from "../components/ScrollShadowBox";
import { api, apiErrorMessage } from "../lib/api";

type WebsiteBooking = {
  _id: string;
  ref: number;
  name: string;
  email: string;
  phone: string;
  tourTitle: string;
  airportCode: string | null;
  airportName: string | null;
  travelDate: string;
  travellers: number;
  bookedAt: string;
  amount: number;
  status: "Paid" | "Pending";
};

type BookingTraveller = {
  _id: string;
  bookingRef: number;
  name: string;
  type: "adult" | "child" | "infant";
  customerName: string | null;
  tourTitle: string | null;
  createdAt: string;
};

type ContactMessage = {
  _id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  status: "new" | "seen" | "archived";
  createdAt: string;
};

type ContactQuery = {
  _id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  pageUrl: string | null;
  status: "new" | "read" | "archived";
  createdAt: string;
};

const STATUS_STYLE: Record<string, string> = {
  Paid: "bg-green-50 text-green-700",
  Pending: "bg-amber-50 text-amber-700",
  new: "bg-red-50 text-red-700",
  seen: "bg-green-50 text-green-700",
  read: "bg-green-50 text-green-700",
  archived: "bg-neutral-100 text-neutral-500",
};

const TABS = [
  { key: "bookings", label: "Bookings" },
  { key: "travellers", label: "Travellers" },
  { key: "contact-messages", label: "Contact Messages" },
  { key: "contact-queries", label: "Contact Queries" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function BookingsTable() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["/admin/old-backup/bookings"],
    queryFn: async () => (await api.get("/admin/old-backup/bookings")).data.items as WebsiteBooking[],
  });
  const pager = usePagination(data, 10);

  if (isLoading) return <p className="text-neutral-500">Loading…</p>;
  if (error) return <p className="text-red-600">{apiErrorMessage(error)}</p>;

  return (
    <>
      <ScrollShadowBox className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="whitespace-nowrap px-4 py-3">Ref</th>
              <th className="whitespace-nowrap px-4 py-3">Booked</th>
              <th className="whitespace-nowrap px-4 py-3">Tour</th>
              <th className="whitespace-nowrap px-4 py-3">Customer</th>
              <th className="whitespace-nowrap px-4 py-3">Travel date</th>
              <th className="whitespace-nowrap px-4 py-3">Travellers</th>
              <th className="whitespace-nowrap px-4 py-3 text-right">Amount</th>
              <th className="whitespace-nowrap px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {pager.pageItems.map((b) => (
              <tr key={b._id}>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-neutral-700">#{b.ref}</td>
                <td className="whitespace-nowrap px-4 py-3 text-neutral-600">
                  {new Date(b.bookedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                </td>
                <td className="px-4 py-3 text-neutral-800">
                  <div className="max-w-[220px] truncate" title={b.tourTitle}>{b.tourTitle}</div>
                </td>
                <td className="px-4 py-3">
                  <p className="max-w-[180px] truncate font-medium text-neutral-800" title={b.name}>{b.name}</p>
                  <p className="max-w-[180px] truncate text-xs text-neutral-500" title={`${b.phone}${b.email ? ` · ${b.email}` : ""}`}>
                    {b.phone}
                    {b.email ? ` · ${b.email}` : ""}
                  </p>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-neutral-700">
                  {new Date(`${b.travelDate}T00:00:00`).toLocaleDateString("en-IN")}
                </td>
                <td className="px-4 py-3 text-neutral-700">{b.travellers}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-neutral-900">
                  ₹{b.amount.toLocaleString("en-IN")}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[b.status]}`}>{b.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.length === 0 && <p className="py-6 text-center text-neutral-400">Nothing here yet.</p>}
      </ScrollShadowBox>
      {pager.total > pager.pageSize && (
        <div className="mt-3 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          <Pagination {...pager} onPage={pager.setPage} label="bookings" />
        </div>
      )}
    </>
  );
}

function TravellersTable() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["/admin/old-backup/booking-travellers"],
    queryFn: async () => (await api.get("/admin/old-backup/booking-travellers")).data.items as BookingTraveller[],
  });
  const pager = usePagination(data, 10);

  if (isLoading) return <p className="text-neutral-500">Loading…</p>;
  if (error) return <p className="text-red-600">{apiErrorMessage(error)}</p>;

  return (
    <>
      <ScrollShadowBox className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="whitespace-nowrap px-4 py-3">Booking Ref</th>
              <th className="whitespace-nowrap px-4 py-3">Traveller</th>
              <th className="whitespace-nowrap px-4 py-3">Type</th>
              <th className="whitespace-nowrap px-4 py-3">Customer</th>
              <th className="whitespace-nowrap px-4 py-3">Tour</th>
              <th className="whitespace-nowrap px-4 py-3">Added</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {pager.pageItems.map((t) => (
              <tr key={t._id}>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-neutral-700">#{t.bookingRef}</td>
                <td className="px-4 py-3 font-medium text-neutral-800">{t.name}</td>
                <td className="px-4 py-3 capitalize text-neutral-700">{t.type}</td>
                <td className="px-4 py-3 text-neutral-700">{t.customerName ?? "—"}</td>
                <td className="px-4 py-3 text-neutral-700">
                  <div className="max-w-[220px] truncate" title={t.tourTitle ?? undefined}>{t.tourTitle ?? "—"}</div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-neutral-600">
                  {new Date(t.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.length === 0 && <p className="py-6 text-center text-neutral-400">Nothing here yet.</p>}
      </ScrollShadowBox>
      {pager.total > pager.pageSize && (
        <div className="mt-3 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          <Pagination {...pager} onPage={pager.setPage} label="travellers" />
        </div>
      )}
    </>
  );
}

function ContactMessagesTable() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["/admin/old-backup/contact-messages"],
    queryFn: async () => (await api.get("/admin/old-backup/contact-messages")).data.items as ContactMessage[],
  });
  const pager = usePagination(data, 10);

  if (isLoading) return <p className="text-neutral-500">Loading…</p>;
  if (error) return <p className="text-red-600">{apiErrorMessage(error)}</p>;

  return (
    <>
      <div className="flex flex-col gap-3">
        {pager.pageItems.map((m) => (
          <div key={m._id} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="mb-1 flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-neutral-900">{m.name}</p>
                <p className="text-xs text-neutral-500">
                  {m.email}
                  {m.phone ? ` · ${m.phone}` : ""} · {new Date(m.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[m.status]}`}>{m.status}</span>
            </div>
            {m.subject && <p className="font-medium text-neutral-800">{m.subject}</p>}
            <p className="whitespace-pre-line text-sm text-neutral-700">{m.message}</p>
          </div>
        ))}
        {data?.length === 0 && <p className="py-6 text-center text-neutral-400">Nothing here yet.</p>}
      </div>
      {pager.total > pager.pageSize && (
        <div className="mt-3 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          <Pagination {...pager} onPage={pager.setPage} label="messages" />
        </div>
      )}
    </>
  );
}

function ContactQueriesTable() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["/admin/old-backup/contact-queries"],
    queryFn: async () => (await api.get("/admin/old-backup/contact-queries")).data.items as ContactQuery[],
  });
  const pager = usePagination(data, 10);

  if (isLoading) return <p className="text-neutral-500">Loading…</p>;
  if (error) return <p className="text-red-600">{apiErrorMessage(error)}</p>;

  return (
    <>
      <div className="flex flex-col gap-3">
        {pager.pageItems.map((m) => (
          <div key={m._id} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="mb-1 flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-neutral-900">{m.name}</p>
                <p className="text-xs text-neutral-500">
                  {m.email}
                  {m.phone ? ` · ${m.phone}` : ""} · {new Date(m.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                </p>
                {m.pageUrl && <p className="text-xs text-neutral-400">{m.pageUrl}</p>}
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[m.status]}`}>{m.status}</span>
            </div>
            {m.subject && <p className="font-medium text-neutral-800">{m.subject}</p>}
            <p className="whitespace-pre-line text-sm text-neutral-700">{m.message}</p>
          </div>
        ))}
        {data?.length === 0 && <p className="py-6 text-center text-neutral-400">Nothing here yet.</p>}
      </div>
      {pager.total > pager.pageSize && (
        <div className="mt-3 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          <Pagination {...pager} onPage={pager.setPage} label="queries" />
        </div>
      )}
    </>
  );
}

export function OldBackupPage() {
  const [tab, setTab] = useState<TabKey>("bookings");

  return (
    <div>
      <div className="mb-5 flex items-center gap-2.5">
        <span className="h-6 w-1.5 rounded-full bg-gradient-to-b from-red-500 to-red-600" />
        <h1 className="text-xl font-bold tracking-tight text-neutral-900">Old Backup</h1>
      </div>
      <p className="mb-4 text-sm text-neutral-500">
        Full historical archive from the legacy website database — every booking, traveller and
        contact message on record, not just the latest 500. Read-only.
      </p>

      <div className="mb-4 flex flex-wrap gap-2 border-b border-neutral-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-red-600 text-red-600"
                : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "bookings" && <BookingsTable />}
      {tab === "travellers" && <TravellersTable />}
      {tab === "contact-messages" && <ContactMessagesTable />}
      {tab === "contact-queries" && <ContactQueriesTable />}
    </div>
  );
}
