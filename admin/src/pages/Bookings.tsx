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
  type: "token" | "full" | "refund";
  status: "created" | "paid" | "failed" | "refunded";
  createdAt: string;
};

const STATUS_STYLE: Record<Booking["status"], string> = {
  pending_payment: "bg-amber-50 text-amber-700",
  confirmed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-red-50 text-red-700",
  completed: "bg-slate-100 text-slate-700",
};

const PAYMENT_STYLE: Record<Booking["paymentStatus"], string> = {
  unpaid: "bg-slate-100 text-slate-600",
  partial: "bg-amber-50 text-amber-700",
  paid: "bg-emerald-50 text-emerald-700",
  refund_initiated: "bg-orange-50 text-orange-700",
  refunded: "bg-slate-100 text-slate-500",
};

const inr = (n: number) => `₹${(n ?? 0).toLocaleString("en-IN")}`;

function name(v: Booking["tourId"] | Booking["customerId"]): string {
  if (!v) return "—";
  if (typeof v === "string") return v;
  return "title" in v ? v.title : v.name;
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
      <h1 className="mb-4 text-lg font-semibold text-slate-900">Bookings</h1>

      {isLoading && <p className="text-slate-500">Loading…</p>}
      {error && <p className="text-red-600">{apiErrorMessage(error)}</p>}

      {bookings && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-2 font-medium">Ref</th>
                <th className="px-4 py-2 font-medium">Tour</th>
                <th className="px-4 py-2 font-medium">Customer</th>
                <th className="px-4 py-2 font-medium">Travel date</th>
                <th className="px-4 py-2 font-medium">Amount</th>
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
                  <td className="px-4 py-2 text-slate-700">
                    {inr(b.amountPaid)} / {inr(b.pricing?.finalAmount)}
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
                    <button onClick={() => setDetailId(b._id)} className="text-slate-600 hover:underline">
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {bookings.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
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
              <p className="text-slate-500">Loading…</p>
            ) : (
              <>
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">{detail.item.bookingRef}</h2>
                    <p className="text-sm text-slate-500">{name(detail.item.tourId)}</p>
                  </div>
                  <button onClick={() => setDetailId(null)} className="text-slate-400 hover:text-slate-600">
                    ✕
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="font-medium text-slate-700">Contact</p>
                    <p className="text-slate-600">{detail.item.contactName}</p>
                    <p className="text-slate-600">{detail.item.contactEmail}</p>
                    <p className="text-slate-600">{detail.item.contactPhone}</p>
                  </div>
                  <div>
                    <p className="font-medium text-slate-700">Pricing</p>
                    <p className="text-slate-600">Base: {inr(detail.item.pricing.baseAmount)}</p>
                    {detail.item.pricing.discountAmount > 0 && (
                      <p className="text-slate-600">
                        Discount ({detail.item.pricing.promoCode}): -{inr(detail.item.pricing.discountAmount)}
                      </p>
                    )}
                    <p className="text-slate-600">Total: {inr(detail.item.pricing.finalAmount)}</p>
                    <p className="text-slate-600">Paid: {inr(detail.item.amountPaid)}</p>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="mb-1 text-sm font-medium text-slate-700">Travellers</p>
                  <ul className="text-sm text-slate-600">
                    {detail.item.travellers.map((t, i) => (
                      <li key={i}>
                        {t.name} ({t.type})
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-4">
                  <p className="mb-1 text-sm font-medium text-slate-700">Transactions</p>
                  {detail.transactions.length === 0 ? (
                    <p className="text-sm text-slate-400">None yet.</p>
                  ) : (
                    <ul className="text-sm text-slate-600">
                      {detail.transactions.map((t) => (
                        <li key={t._id}>
                          {t.type} · {inr(t.amount)} · {t.status} · {new Date(t.createdAt).toLocaleString("en-IN")}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {(detail.item.paymentStatus === "paid" || detail.item.paymentStatus === "partial") && (
                  <div className="mt-5 rounded-lg border border-slate-200 p-3">
                    <p className="mb-2 text-sm font-medium text-slate-700">Issue refund</p>
                    {refundError && <p className="mb-2 text-sm text-red-600">{refundError}</p>}
                    <div className="flex gap-2">
                      <input
                        type="number"
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
