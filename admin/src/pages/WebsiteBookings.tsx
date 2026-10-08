import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Pagination, usePagination } from "../components/Pagination";
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

type WebsiteBookingDetail = WebsiteBooking & {
  notes: string | null;
  rzpTokenOrderId: string | null;
};

const STATUS_STYLE: Record<WebsiteBooking["status"], string> = {
  Paid: "bg-green-50 text-green-700",
  Pending: "bg-amber-50 text-amber-700",
};

export function WebsiteBookingsPage() {
  const { data: bookings, isLoading, error } = useQuery({
    queryKey: ["/admin/website-bookings"],
    queryFn: async () => (await api.get("/admin/website-bookings")).data.items as WebsiteBooking[],
  });

  const pager = usePagination(bookings, 10);

  const [viewingRef, setViewingRef] = useState<number | null>(null);
  const { data: detail } = useQuery({
    queryKey: ["/admin/website-bookings", viewingRef],
    queryFn: async () => (await api.get(`/admin/website-bookings/${viewingRef}`)).data.item as WebsiteBookingDetail,
    enabled: viewingRef !== null,
  });

  return (
    <div>
      <div className="mb-5 flex items-center gap-2.5">
        <span className="h-6 w-1.5 rounded-full bg-gradient-to-b from-red-500 to-red-600" />
        <h1 className="text-xl font-bold tracking-tight text-neutral-900">Website Bookings</h1>
      </div>
      <p className="mb-4 text-sm text-neutral-500">
        Bookings taken on the website, read-only. The latest 500 are shown.
      </p>

      {isLoading && <p className="text-neutral-500">Loading…</p>}
      {error && <p className="text-red-600">{apiErrorMessage(error)}</p>}

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3">Ref</th>
              <th className="px-4 py-3">Booked</th>
              <th className="px-4 py-3">Tour</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Travel date</th>
              <th className="px-4 py-3">Travellers</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {pager.pageItems.map((b) => (
              <tr key={b._id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-neutral-700">
                  #{b.ref} <span className="ml-1 font-sans font-semibold text-neutral-500">[Website]</span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-neutral-600">
                  {new Date(b.bookedAt).toLocaleString("en-IN")}
                </td>
                <td className="px-4 py-3 text-neutral-800">
                  {b.tourTitle}
                  {b.airportCode && <span className="block text-xs text-neutral-500">{b.airportCode} · {b.airportName}</span>}
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-neutral-800">{b.name}</p>
                  <p className="text-xs text-neutral-500">
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
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[b.status]}`}>
                    {b.status}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <button
                    onClick={() => setViewingRef(b.ref)}
                    className="rounded-md border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {bookings?.length === 0 && <p className="py-6 text-center text-neutral-400">Nothing here yet.</p>}
      </div>

      {pager.total > pager.pageSize && (
        <div className="mt-3 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          <Pagination
            page={pager.page}
            pageCount={pager.pageCount}
            total={pager.total}
            pageSize={pager.pageSize}
            onPage={pager.setPage}
            label="bookings"
          />
        </div>
      )}

      {viewingRef !== null && (
        <div className="fixed inset-0 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
          <div className="my-8 w-full max-w-lg rounded-xl bg-white p-6 shadow-lg">
            {!detail ? (
              <p className="text-neutral-500">Loading…</p>
            ) : (
              <>
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-neutral-900">
                      #{detail.ref} <span className="font-normal text-neutral-500">[Website]</span>
                    </h2>
                    <p className="text-sm text-neutral-500">{detail.tourTitle}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[detail.status]}`}>
                    {detail.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-neutral-500">Customer</p>
                    <p className="text-neutral-800">{detail.name}</p>
                    <p className="text-xs text-neutral-500">
                      {detail.phone}
                      {detail.email ? ` · ${detail.email}` : ""}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">Amount</p>
                    <p className="font-medium text-neutral-800">₹{detail.amount.toLocaleString("en-IN")}</p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">Travel date</p>
                    <p className="text-neutral-800">
                      {new Date(`${detail.travelDate}T00:00:00`).toLocaleDateString("en-IN")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">Razorpay order ID</p>
                    <p className="font-mono text-xs text-neutral-800">{detail.rzpTokenOrderId || "—"}</p>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="mb-1 text-xs text-neutral-500">
                    Raw booking notes — this is the actual evidence a payment marker was checked against. There's
                    no separate payment-log table on this database, so this text is the real source of the
                    Paid/Pending status above.
                  </p>
                  <div className="whitespace-pre-wrap rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
                    {detail.notes || "No notes recorded."}
                  </div>
                </div>

                <div className="mt-5 flex justify-end">
                  <button
                    onClick={() => setViewingRef(null)}
                    className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
