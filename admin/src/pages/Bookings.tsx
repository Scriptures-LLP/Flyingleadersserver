import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api, apiErrorMessage } from "../lib/api";

type Traveller = { name: string; age?: number; gender?: string; type: "adult" | "child" | "infant" };

type Booking = {
  _id: string;
  bookingRef: string;
  tourId?: { _id: string; title: string; slug: string } | string;
  customerId?: { _id: string; name: string; email: string } | string;
  travelDate: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  travellers: Traveller[];
  pricing: { baseAmount: number; discountAmount: number; promoCode?: string; finalAmount: number; tokenAmount: number };
  amountPaid: number;
  status: "pending_payment" | "confirmed" | "cancelled" | "completed";
  paymentStatus: "unpaid" | "partial" | "paid" | "refund_initiated" | "refunded";
  createdAt: string;
};

type Transaction = {
  _id: string;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  amount: number;
  type: "token" | "full" | "balance" | "refund";
  status: "created" | "paid" | "failed" | "refunded";
  createdAt: string;
};

const TXN_TYPE_LABEL: Record<Transaction["type"], string> = {
  token: "Partial (token) payment",
  full: "Full payment",
  balance: "Balance payment",
  refund: "Refund",
};

// "created" = the customer opened the payment screen but never completed it
// (no money moved) — say so, rather than showing its amount as if it were paid.
const TXN_STATUS: Record<Transaction["status"], { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-green-50 text-green-700" },
  refunded: { label: "Refunded", className: "bg-slate-100 text-slate-600" },
  created: { label: "Not paid — checkout not completed", className: "bg-slate-100 text-slate-500" },
  failed: { label: "Failed / cancelled", className: "bg-red-50 text-red-700" },
};

const STATUS_STYLE: Record<Booking["status"], string> = {
  pending_payment: "bg-red-50 text-red-700",
  confirmed: "bg-green-50 text-green-700",
  cancelled: "bg-red-50 text-red-700",
  completed: "bg-green-50 text-green-700",
};

const PAYMENT_STYLE: Record<Booking["paymentStatus"], string> = {
  unpaid: "bg-neutral-100 text-neutral-600",
  partial: "bg-red-50 text-red-700",
  paid: "bg-green-50 text-green-700",
  refund_initiated: "bg-red-50 text-red-700",
  refunded: "bg-neutral-100 text-neutral-500",
};

const inr = (n: number) => `₹${(n ?? 0).toLocaleString("en-IN")}`;

// What's still to pay. A cancelled / refunded booking owes nothing, so it's 0
// rather than the full price.
function remainingOf(b: Booking): number {
  if (b.status === "cancelled" || b.paymentStatus === "refunded") return 0;
  return Math.max(0, Math.round(((b.pricing?.finalAmount ?? 0) - (b.amountPaid ?? 0)) * 100) / 100);
}

function name(v: Booking["tourId"] | Booking["customerId"]): string {
  if (!v) return "—";
  if (typeof v === "string") return v;
  return "title" in v ? v.title : v.name;
}

function travellerSummary(travellers: Traveller[]): string {
  const counts = { adult: 0, child: 0, infant: 0 };
  for (const t of travellers) counts[t.type]++;
  const parts = [
    counts.adult && `${counts.adult} adult${counts.adult > 1 ? "s" : ""}`,
    counts.child && `${counts.child} child${counts.child > 1 ? "ren" : ""}`,
    counts.infant && `${counts.infant} infant${counts.infant > 1 ? "s" : ""}`,
  ].filter(Boolean);
  return `${travellers.length} — ${parts.join(", ")}`;
}

export function BookingsPage() {
  const queryClient = useQueryClient();
  const { data: bookings, isLoading, error } = useQuery({
    queryKey: ["/admin/bookings"],
    queryFn: async () => (await api.get("/admin/bookings")).data.items as Booking[],
  });

  const [detailId, setDetailId] = useState<string | null>(null);
  const { data: detail } = useQuery({
    queryKey: ["/admin/bookings", detailId],
    queryFn: async () => (await api.get(`/admin/bookings/${detailId}`)).data as { item: Booking; transactions: Transaction[] },
    enabled: !!detailId,
  });

  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundError, setRefundError] = useState<string | null>(null);

  const refundMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {};
      if (refundAmount) body.amount = Number(refundAmount);
      if (refundReason) body.reason = refundReason;
      return api.post(`/admin/bookings/${detailId}/refund`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/admin/bookings"] });
      queryClient.invalidateQueries({ queryKey: ["/admin/bookings", detailId] });
      setRefundAmount("");
      setRefundReason("");
      setRefundError(null);
    },
    onError: (err) => setRefundError(apiErrorMessage(err)),
  });

  return (
    <div>
      <div className="mb-5 flex items-center gap-2.5">
        <span className="h-6 w-1.5 rounded-full bg-gradient-to-b from-red-500 to-red-600" />
        <h1 className="text-xl font-bold tracking-tight text-neutral-900">Bookings</h1>
      </div>

      {isLoading && <p className="text-neutral-500">Loading…</p>}
      {error && <p className="text-red-600">{apiErrorMessage(error)}</p>}

      {bookings && (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-4 py-2 font-medium">Ref</th>
                <th className="px-4 py-2 font-medium">Tour</th>
                <th className="px-4 py-2 font-medium">Customer</th>
                <th className="px-4 py-2 font-medium">Travel date</th>
                <th className="px-4 py-2 font-medium">Travellers</th>
                <th className="px-4 py-2 font-medium">Total</th>
                <th className="px-4 py-2 font-medium">Paid</th>
                <th className="px-4 py-2 font-medium">Remaining</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Payment</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b._id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 font-mono text-xs text-slate-700">{b.bookingRef}</td>
                  <td className="px-4 py-2 text-slate-700">{name(b.tourId)}</td>
                  <td className="px-4 py-2 text-slate-700">{name(b.customerId)}</td>
                  <td className="px-4 py-2 text-slate-700">{new Date(b.travelDate).toLocaleDateString("en-IN")}</td>
                  <td className="px-4 py-2 text-slate-700">{travellerSummary(b.travellers)}</td>
                  <td className="px-4 py-2 text-slate-700">{inr(b.pricing?.finalAmount)}</td>
                  <td className="px-4 py-2 font-medium text-slate-900">{inr(b.amountPaid)}</td>
                  <td className={`px-4 py-2 ${remainingOf(b) > 0 ? "font-medium text-red-700" : "text-slate-500"}`}>
                    {inr(remainingOf(b))}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[b.status]}`}>
                      {b.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PAYMENT_STYLE[b.paymentStatus]}`}>
                      {b.paymentStatus.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => setDetailId(b._id)} className="text-neutral-600 hover:underline">
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {bookings.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-6 text-center text-slate-400">
                    No bookings yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {detailId && (
        <div className="fixed inset-0 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
          <div className="my-8 w-full max-w-xl rounded-xl bg-white p-6 shadow-lg">
            {!detail ? (
              <p className="text-neutral-500">Loading…</p>
            ) : (
              <>
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-neutral-900">{detail.item.bookingRef}</h2>
                    <p className="text-sm text-neutral-500">{name(detail.item.tourId)}</p>
                  </div>
                  <button onClick={() => setDetailId(null)} className="text-neutral-400 hover:text-neutral-600">
                    ✕
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="font-medium text-neutral-700">Contact</p>
                    <p className="text-neutral-600">{detail.item.contactName}</p>
                    <p className="text-neutral-600">{detail.item.contactEmail}</p>
                    <p className="text-neutral-600">{detail.item.contactPhone}</p>
                  </div>
                  <div>
                    <p className="font-medium text-neutral-700">Pricing</p>
                    <p className="text-neutral-600">Base: {inr(detail.item.pricing.baseAmount)}</p>
                    {detail.item.pricing.discountAmount > 0 && (
                      <p className="text-neutral-600">
                        Discount ({detail.item.pricing.promoCode}): -{inr(detail.item.pricing.discountAmount)}
                      </p>
                    )}
                    <p className="text-slate-600">Total Amount: {inr(detail.item.pricing.finalAmount)}</p>
                    <p className="text-slate-600">Paid Amount: {inr(detail.item.amountPaid)}</p>
                    <p className="font-medium text-slate-800">Remaining Amount: {inr(remainingOf(detail.item))}</p>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="mb-1 text-sm font-medium text-neutral-700">
                    Travellers ({detail.item.travellers.length})
                  </p>
                  <ul className="text-sm text-neutral-600">
                    {detail.item.travellers.map((t, i) => (
                      <li key={i}>
                        {t.name} — {t.type}
                        {t.age !== undefined && t.age !== null ? `, age ${t.age}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-4">
                  <p className="mb-1 text-sm font-medium text-neutral-700">Transactions</p>
                  {detail.transactions.length === 0 ? (
                    <p className="text-sm text-neutral-400">None yet.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100 text-sm text-slate-600">
                      {detail.transactions.map((t) => {
                        const st = TXN_STATUS[t.status];
                        const moved = t.status === "paid" || t.status === "refunded";
                        return (
                          <li key={t._id} className="flex items-center justify-between gap-3 py-1.5">
                            <div>
                              <span className={moved ? "font-medium text-slate-800" : "text-slate-400"}>
                                {TXN_TYPE_LABEL[t.type]}
                              </span>
                              <span className="ml-2 text-xs text-slate-400">
                                {new Date(t.createdAt).toLocaleString("en-IN")}
                              </span>
                              <div>
                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.className}`}>
                                  {st.label}
                                </span>
                              </div>
                            </div>
                            <span className={moved ? "font-semibold text-slate-900" : "text-slate-400 line-through"}>
                              {t.type === "refund" ? "-" : ""}
                              {inr(t.amount)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {(detail.item.paymentStatus === "paid" || detail.item.paymentStatus === "partial") && (
                  <div className="mt-5 rounded-lg border border-neutral-200 p-3">
                    <p className="mb-2 text-sm font-medium text-neutral-700">Issue refund</p>
                    {refundError && <p className="mb-2 text-sm text-red-600">{refundError}</p>}
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min="0"
                        max={detail.item.amountPaid}
                        placeholder={`Amount (max ${detail.item.amountPaid})`}
                        className="input"
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                      />
                      <input
                        placeholder="Reason (optional)"
                        className="input"
                        value={refundReason}
                        onChange={(e) => setRefundReason(e.target.value)}
                      />
                      <button
                        onClick={() => {
                          if (confirm("Issue this refund via Razorpay? This moves real money.")) refundMutation.mutate();
                        }}
                        disabled={refundMutation.isPending}
                        className="shrink-0 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {refundMutation.isPending ? "Refunding…" : "Refund"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
