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

type OfficeMethod = "cash" | "upi" | "bank_transfer" | "card" | "cheque" | "other";

type Transaction = {
  _id: string;
  channel?: "online" | "office";
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  amount: number;
  type: "token" | "full" | "balance" | "refund";
  status: "created" | "paid" | "failed" | "refunded" | "voided";
  createdAt: string;
  office?: {
    method: OfficeMethod;
    reference?: string;
    note?: string;
    receivedAt: string;
    recordedBy?: { name: string } | string;
    voidedAt?: string;
    voidedBy?: { name: string } | string;
    voidReason?: string;
  };
};

const OFFICE_METHODS: { value: OfficeMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "card", label: "Card" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];
const methodLabel = (m?: OfficeMethod) => OFFICE_METHODS.find((o) => o.value === m)?.label ?? "Office";
const personName = (v?: { name: string } | string) => (typeof v === "object" && v ? v.name : undefined);
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  refunded: { label: "Refunded", className: "bg-neutral-100 text-neutral-600" },
  created: { label: "Not paid — checkout not completed", className: "bg-neutral-100 text-neutral-500" },
  failed: { label: "Failed / cancelled", className: "bg-red-50 text-red-700" },
  voided: { label: "Voided", className: "bg-red-50 text-red-700" },
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

// Office payments can be recorded while there's something left to pay, on a live
// (not cancelled / refunded) booking.
function canRecordOffice(b: Booking): boolean {
  return b.status !== "cancelled" && (b.paymentStatus === "unpaid" || b.paymentStatus === "partial") && remainingOf(b) > 0;
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
    queryFn: async () =>
      (await api.get(`/admin/bookings/${detailId}`)).data as {
        item: Booking;
        transactions: Transaction[];
        // How much of what's been paid can still go back through Razorpay
        // (money taken at the office can't).
        onlineRefundable: number;
      },
    enabled: !!detailId,
  });

  // Payment taken at the office (cash / UPI / bank …) — recorded here so the
  // customer's app shows the new balance and payment history.
  const [officeAmount, setOfficeAmount] = useState("");
  const [officeMethod, setOfficeMethod] = useState<OfficeMethod>("cash");
  const [officeDate, setOfficeDate] = useState(todayStr());
  const [officeRef, setOfficeRef] = useState("");
  const [officeNote, setOfficeNote] = useState("");
  const [officeError, setOfficeError] = useState<string | null>(null);
  // Void problems show beside the transactions, since the record card above is
  // hidden once a booking is fully paid.
  const [voidError, setVoidError] = useState<string | null>(null);

  const refreshBooking = () => {
    queryClient.invalidateQueries({ queryKey: ["/admin/bookings"] });
    queryClient.invalidateQueries({ queryKey: ["/admin/bookings", detailId] });
  };

  const closeDetail = () => {
    setDetailId(null);
    setOfficeAmount("");
    setOfficeMethod("cash");
    setOfficeDate(todayStr());
    setOfficeRef("");
    setOfficeNote("");
    setOfficeError(null);
    setVoidError(null);
    setRefundError(null);
  };

  const recordMutation = useMutation({
    mutationFn: async () => {
      // "Today" means right now; an earlier day is stamped at midday, so it can
      // never land in the future by accident.
      const receivedAt = officeDate === todayStr() ? new Date() : new Date(`${officeDate}T12:00:00`);
      return api.post(`/admin/bookings/${detailId}/payments`, {
        amount: Number(officeAmount),
        method: officeMethod,
        receivedAt: receivedAt.toISOString(),
        ...(officeRef.trim() ? { reference: officeRef.trim() } : {}),
        ...(officeNote.trim() ? { note: officeNote.trim() } : {}),
      });
    },
    onSuccess: () => {
      refreshBooking();
      setOfficeAmount("");
      setOfficeRef("");
      setOfficeNote("");
      setOfficeError(null);
    },
    onError: (err) => setOfficeError(apiErrorMessage(err)),
  });

  const voidMutation = useMutation({
    mutationFn: async ({ txnId, reason }: { txnId: string; reason: string }) =>
      api.post(`/admin/bookings/${detailId}/payments/${txnId}/void`, { reason }),
    onSuccess: () => {
      refreshBooking();
      setVoidError(null);
    },
    onError: (err) => setVoidError(apiErrorMessage(err)),
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
                <tr key={b._id} className="border-b border-neutral-100 last:border-0">
                  <td className="px-4 py-2 font-mono text-xs text-neutral-700">{b.bookingRef}</td>
                  <td className="px-4 py-2 text-neutral-700">{name(b.tourId)}</td>
                  <td className="px-4 py-2 text-neutral-700">{name(b.customerId)}</td>
                  <td className="px-4 py-2 text-neutral-700">{new Date(b.travelDate).toLocaleDateString("en-IN")}</td>
                  <td className="px-4 py-2 text-neutral-700">{travellerSummary(b.travellers)}</td>
                  <td className="px-4 py-2 text-neutral-700">{inr(b.pricing?.finalAmount)}</td>
                  <td className="px-4 py-2 font-medium text-neutral-900">{inr(b.amountPaid)}</td>
                  <td className={`px-4 py-2 ${remainingOf(b) > 0 ? "font-medium text-red-700" : "text-neutral-500"}`}>
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
                  <td colSpan={11} className="px-4 py-6 text-center text-neutral-400">
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
                  <button onClick={closeDetail} className="text-neutral-400 hover:text-neutral-600">
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
                    <p className="text-neutral-600">Total Amount: {inr(detail.item.pricing.finalAmount)}</p>
                    <p className="text-neutral-600">Paid Amount: {inr(detail.item.amountPaid)}</p>
                    <p className="font-medium text-neutral-800">Remaining Amount: {inr(remainingOf(detail.item))}</p>
                  </div>
                </div>

                {canRecordOffice(detail.item) && (
                  <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                    <p className="text-sm font-medium text-neutral-800">Record a payment received at the office</p>
                    <p className="mb-2 text-xs text-neutral-500">
                      Customer paid in person? Enter it here — it updates their balance and payment history in the app
                      straight away.
                    </p>
                    {officeError && <p className="mb-2 text-sm text-red-600">{officeError}</p>}
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs text-neutral-600">
                        Amount received (₹)
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          max={remainingOf(detail.item)}
                          placeholder={`Up to ${remainingOf(detail.item)}`}
                          className="input mt-0.5"
                          value={officeAmount}
                          onChange={(e) => {
                            setOfficeAmount(e.target.value);
                            setOfficeError(null);
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setOfficeAmount(String(remainingOf(detail.item)));
                            setOfficeError(null);
                          }}
                          className="mt-0.5 text-xs text-red-700 hover:underline"
                        >
                          Full remaining {inr(remainingOf(detail.item))}
                        </button>
                      </label>
                      <label className="text-xs text-neutral-600">
                        Paid by
                        <select
                          className="input mt-0.5"
                          value={officeMethod}
                          onChange={(e) => setOfficeMethod(e.target.value as OfficeMethod)}
                        >
                          {OFFICE_METHODS.map((m) => (
                            <option key={m.value} value={m.value}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-neutral-600">
                        Received on
                        <input
                          type="date"
                          max={todayStr()}
                          className="input mt-0.5"
                          value={officeDate}
                          onChange={(e) => setOfficeDate(e.target.value || todayStr())}
                        />
                      </label>
                      <label className="text-xs text-neutral-600">
                        Receipt / reference no. (optional)
                        <input
                          className="input mt-0.5"
                          maxLength={100}
                          placeholder="e.g. receipt no., UPI ref"
                          value={officeRef}
                          onChange={(e) => setOfficeRef(e.target.value)}
                        />
                      </label>
                      <label className="col-span-2 text-xs text-neutral-600">
                        Internal note (optional — the customer doesn’t see this)
                        <input
                          className="input mt-0.5"
                          maxLength={300}
                          value={officeNote}
                          onChange={(e) => setOfficeNote(e.target.value)}
                        />
                      </label>
                    </div>
                    <button
                      onClick={() => {
                        const amt = Number(officeAmount);
                        if (!(amt > 0)) return setOfficeError("Enter the amount received.");
                        if (amt > remainingOf(detail.item)) {
                          return setOfficeError(`That's more than the remaining ${inr(remainingOf(detail.item))}.`);
                        }
                        setOfficeError(null);
                        if (
                          confirm(
                            `Record ${inr(amt)} received by ${methodLabel(officeMethod).toLowerCase()} for ${detail.item.bookingRef}?\n\nThe customer will see it in their app straight away.`,
                          )
                        ) {
                          recordMutation.mutate();
                        }
                      }}
                      disabled={recordMutation.isPending}
                      className="mt-3 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                    >
                      {recordMutation.isPending ? "Saving…" : "Record payment"}
                    </button>
                  </div>
                )}

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
                  {voidError && <p className="mb-2 text-sm text-red-600">{voidError}</p>}
                  {detail.transactions.length === 0 ? (
                    <p className="text-sm text-neutral-400">None yet.</p>
                  ) : (
                    <ul className="divide-y divide-neutral-100 text-sm text-neutral-600">
                      {detail.transactions.map((t) => {
                        const st = TXN_STATUS[t.status];
                        const moved = t.status === "paid" || t.status === "refunded";
                        const office = t.channel === "office" ? t.office : undefined;
                        return (
                          <li key={t._id} className="flex items-center justify-between gap-3 py-1.5">
                            <div>
                              <span className={moved ? "font-medium text-neutral-800" : "text-neutral-400"}>
                                {office ? `Paid at office · ${methodLabel(office.method)}` : TXN_TYPE_LABEL[t.type]}
                              </span>
                              <span className="ml-2 text-xs text-neutral-400">
                                {new Date(office?.receivedAt ?? t.createdAt).toLocaleString("en-IN")}
                              </span>
                              <div>
                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.className}`}>
                                  {st.label}
                                </span>
                                {office?.reference && (
                                  <span className="ml-2 text-xs text-neutral-500">Ref: {office.reference}</span>
                                )}
                              </div>
                              {office && (
                                <div className="mt-0.5 text-xs text-neutral-400">
                                  Entered by {personName(office.recordedBy) ?? "staff"}
                                  {office.note ? ` · “${office.note}”` : ""}
                                  {t.status === "voided" &&
                                    ` · voided by ${personName(office.voidedBy) ?? "staff"}: ${office.voidReason ?? ""}`}
                                </div>
                              )}
                            </div>
                            <div className="text-right">
                              <span
                                className={
                                  t.status === "voided"
                                    ? "text-neutral-400 line-through"
                                    : moved
                                      ? "font-semibold text-neutral-900"
                                      : "text-neutral-400 line-through"
                                }
                              >
                                {t.type === "refund" ? "-" : ""}
                                {inr(t.amount)}
                              </span>
                              {office && t.status === "paid" && (
                                <div>
                                  <button
                                    onClick={() => {
                                      const reason = window.prompt(
                                        `Void this ${inr(t.amount)} office payment?\nIt was entered by mistake — please say why (required):`,
                                      );
                                      if (reason && reason.trim().length >= 3) {
                                        voidMutation.mutate({ txnId: t._id, reason: reason.trim() });
                                      } else if (reason !== null) {
                                        setVoidError("Please give a reason (at least 3 characters) to void a payment.");
                                      }
                                    }}
                                    disabled={voidMutation.isPending}
                                    className="text-xs text-red-600 hover:underline disabled:opacity-50"
                                  >
                                    Void
                                  </button>
                                </div>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {(detail.item.paymentStatus === "paid" || detail.item.paymentStatus === "partial") &&
                  (detail.onlineRefundable > 0 ? (
                    <div className="mt-5 rounded-lg border border-neutral-200 p-3">
                      <p className="mb-1 text-sm font-medium text-neutral-700">Issue refund</p>
                      <p className="mb-2 text-xs text-neutral-500">
                        Up to {inr(detail.onlineRefundable)} can be refunded online through Razorpay.
                        {detail.item.amountPaid - detail.onlineRefundable > 0 &&
                          " Money paid at the office has to be refunded at the office."}
                      </p>
                      {refundError && <p className="mb-2 text-sm text-red-600">{refundError}</p>}
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min="0"
                          max={detail.onlineRefundable}
                          placeholder={`Amount (max ${detail.onlineRefundable})`}
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
                  ) : (
                    <p className="mt-5 rounded-lg border border-neutral-200 p-3 text-xs text-neutral-500">
                      Nothing can be refunded online on this booking — the money was paid at the office, so any
                      refund has to be handled there.
                    </p>
                  ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
