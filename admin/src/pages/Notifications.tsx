import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { api, apiErrorMessage } from "../lib/api";

type Category = "promotions" | "tripReminders" | "bookingUpdates";
type AudienceType = "all" | "tour_booked" | "balance_due" | "travelling_soon" | "never_booked" | "customer";
type Opens = "home" | "tour" | "trips" | "referral";

type Campaign = {
  _id: string;
  title: string;
  body: string;
  category: Category;
  audience: {
    type: AudienceType;
    tourId?: { title: string } | string;
    customerId?: { name: string } | string;
    days?: number;
  };
  stats: { audience: number; recipients: number; devices: number; sent: number; failed: number };
  sentBy?: { name: string } | string;
  createdAt: string;
};

const TITLE_MAX = 65;
const BODY_MAX = 240;

const CATEGORIES: { value: Category; label: string; help: string }[] = [
  { value: "promotions", label: "Offer or announcement", help: "Discounts, new tours, festive deals" },
  { value: "tripReminders", label: "Trip reminder", help: "Departure coming up, documents, packing" },
  { value: "bookingUpdates", label: "Important update", help: "Changes affecting a booking" },
];

const AUDIENCES: { value: AudienceType; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "tour_booked", label: "Customers who booked a particular tour" },
  { value: "balance_due", label: "Customers with a balance still to pay" },
  { value: "travelling_soon", label: "Customers travelling soon" },
  { value: "never_booked", label: "Customers who haven't booked yet" },
  { value: "customer", label: "One customer (good for testing)" },
];

const OPENS: { value: Opens; label: string }[] = [
  { value: "home", label: "The home screen" },
  { value: "tour", label: "A particular tour" },
  { value: "trips", label: "Their trips" },
  { value: "referral", label: "Refer & earn" },
];

const CATEGORY_LABEL: Record<Category, string> = {
  promotions: "Offer",
  tripReminders: "Trip reminder",
  bookingUpdates: "Update",
};

function audienceLabel(a: Campaign["audience"]): string {
  switch (a.type) {
    case "all":
      return "Everyone";
    case "tour_booked":
      return `Booked ${typeof a.tourId === "object" ? a.tourId.title : "a tour"}`;
    case "balance_due":
      return "Balance to pay";
    case "travelling_soon":
      return `Travelling in ${a.days ?? 7} days`;
    case "never_booked":
      return "Not booked yet";
    case "customer":
      return typeof a.customerId === "object" ? a.customerId.name : "One customer";
  }
}

// Debounces a value so the audience count isn't re-queried on every keystroke.
function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function NotificationsPage() {
  const queryClient = useQueryClient();

  const [category, setCategory] = useState<Category>("promotions");
  const [audienceType, setAudienceType] = useState<AudienceType>("all");
  const [tourId, setTourId] = useState("");
  const [days, setDays] = useState("7");
  const [customer, setCustomer] = useState<{ _id: string; name: string; email?: string; phone?: string } | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [opens, setOpens] = useState<Opens>("home");
  const [openTourSlug, setOpenTourSlug] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: tours } = useQuery({
    queryKey: ["/admin/tours"],
    queryFn: async () => (await api.get("/admin/tours")).data.items as { _id: string; title: string; slug: string; isActive?: boolean }[],
  });
  const { data: promos } = useQuery({
    queryKey: ["/admin/promo-codes"],
    queryFn: async () => (await api.get("/admin/promo-codes")).data.items as { _id: string; code: string; isActive?: boolean }[],
  });

  const debouncedQuery = useDebounced(customerQuery);
  const { data: matches } = useQuery({
    queryKey: ["/admin/notifications/customers", debouncedQuery],
    queryFn: async () =>
      (await api.get("/admin/notifications/customers", { params: { q: debouncedQuery } })).data.items as {
        _id: string;
        name: string;
        email?: string;
        phone?: string;
      }[],
    enabled: audienceType === "customer" && !customer && debouncedQuery.trim().length >= 2,
  });

  // The audience being described, in the shape the API takes — null until it's complete.
  const audience =
    audienceType === "tour_booked"
      ? tourId
        ? { type: audienceType, tourId }
        : null
      : audienceType === "customer"
        ? customer
          ? { type: audienceType, customerId: customer._id }
          : null
        : audienceType === "travelling_soon"
          ? { type: audienceType, days: Math.max(1, Math.min(365, Number(days) || 7)) }
          : { type: audienceType };
  const debouncedAudience = useDebounced(audience);

  const { data: reach, isFetching: reachLoading } = useQuery({
    queryKey: ["/admin/notifications/preview", debouncedAudience, category],
    queryFn: async () =>
      (await api.get("/admin/notifications/preview", { params: { ...debouncedAudience, category } })).data as {
        audience: number;
        recipients: number;
        optedOut: number;
        devices: number;
      },
    enabled: !!debouncedAudience,
  });

  const { data: history } = useQuery({
    queryKey: ["/admin/notifications"],
    queryFn: async () => (await api.get("/admin/notifications")).data.items as Campaign[],
  });

  const sendMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post("/admin/notifications/send", {
          title,
          body,
          category,
          audience,
          opens,
          ...(opens === "tour" ? { tourSlug: openTourSlug } : {}),
        })
      ).data.item as Campaign,
    onSuccess: (c) => {
      queryClient.invalidateQueries({ queryKey: ["/admin/notifications"] });
      setError(null);
      setResult(
        `Sent to ${c.stats.recipients} customer${c.stats.recipients === 1 ? "" : "s"} — pushed to ${c.stats.sent} phone${c.stats.sent === 1 ? "" : "s"}` +
          (c.stats.failed ? ` (${c.stats.failed} couldn't be reached)` : "") +
          ". Everyone selected can also see it in their app's notification list.",
      );
      setTitle("");
      setBody("");
    },
    onError: (err) => {
      setResult(null);
      setError(apiErrorMessage(err));
    },
  });

  const activeTours = (tours ?? []).filter((t) => t.isActive !== false);
  const activePromos = (promos ?? []).filter((p) => p.isActive !== false);

  const formError =
    !title.trim() ? "Enter a title." : !body.trim() ? "Enter a message." : !audience ? "Finish choosing who it goes to." : opens === "tour" && !openTourSlug ? "Choose which tour it should open." : null;
  const canSend = !formError && !sendMutation.isPending && (reach?.recipients ?? 0) > 0;

  function onSend() {
    if (!canSend || !reach) return;
    const who = audienceType === "all" ? "EVERY customer" : `${reach.recipients} customer${reach.recipients === 1 ? "" : "s"}`;
    if (confirm(`Send "${title.trim()}" to ${who}?\n\nThis goes out straight away and can't be undone.`)) {
      setResult(null);
      setError(null);
      sendMutation.mutate();
    }
  }

  return (
    <div>
      <div className="mb-1 flex items-center gap-2.5">
        <span className="h-6 w-1.5 rounded-full bg-gradient-to-b from-red-500 to-red-600" />
        <h1 className="text-xl font-bold tracking-tight text-neutral-900">Notifications</h1>
      </div>
      <p className="mb-5 text-sm text-neutral-500">
        Send an offer, reminder or update to your customers’ phones. Each one also appears in the notification list inside
        the app.
      </p>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          {/* 1. what kind */}
          <div>
            <p className="mb-2 text-sm font-medium text-neutral-800">What kind of message is it?</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    category === c.value ? "border-red-500 bg-red-50 ring-2 ring-red-500/20" : "border-neutral-200 hover:border-neutral-300"
                  }`}
                >
                  <span className="block text-sm font-semibold text-neutral-900">{c.label}</span>
                  <span className="block text-xs text-neutral-500">{c.help}</span>
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-neutral-400">
              Customers can switch each kind off in the app — anyone who has won’t receive it.
            </p>
          </div>

          {/* 2. who */}
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-800">Who should get it?</label>
            <select
              className="input"
              value={audienceType}
              onChange={(e) => {
                setAudienceType(e.target.value as AudienceType);
                setCustomer(null);
                setCustomerQuery("");
              }}
            >
              {AUDIENCES.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>

            {audienceType === "tour_booked" && (
              <select className="input mt-2" value={tourId} onChange={(e) => setTourId(e.target.value)}>
                <option value="">Choose a tour…</option>
                {(tours ?? []).map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.title}
                  </option>
                ))}
              </select>
            )}

            {audienceType === "travelling_soon" && (
              <label className="mt-2 flex items-center gap-2 text-sm text-neutral-600">
                Leaving within the next
                <input
                  type="number"
                  min={1}
                  max={365}
                  className="input !w-20"
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                />
                days
              </label>
            )}

            {audienceType === "customer" && (
              <div className="mt-2">
                {customer ? (
                  <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">
                    <span>
                      <span className="font-medium text-neutral-900">{customer.name}</span>{" "}
                      <span className="text-neutral-500">{customer.email ?? customer.phone}</span>
                    </span>
                    <button type="button" onClick={() => setCustomer(null)} className="text-xs text-neutral-500 hover:underline">
                      Change
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      className="input"
                      placeholder="Search by name, email or phone…"
                      value={customerQuery}
                      onChange={(e) => setCustomerQuery(e.target.value)}
                    />
                    {(matches ?? []).length > 0 && (
                      <ul className="mt-1 divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white text-sm shadow-sm">
                        {matches!.map((m) => (
                          <li key={m._id}>
                            <button
                              type="button"
                              className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-neutral-50"
                              onClick={() => setCustomer(m)}
                            >
                              <span className="font-medium text-neutral-900">{m.name}</span>
                              <span className="text-xs text-neutral-500">{m.email ?? m.phone}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="mt-2 rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-600" aria-live="polite">
              {!audience ? (
                "Finish choosing the audience to see how many people it reaches."
              ) : reachLoading || !reach ? (
                "Counting…"
              ) : reach.recipients === 0 ? (
                <span className="text-red-700">
                  {reach.audience === 0 ? "No customers match this audience." : "Everyone in this audience has switched this kind of notification off."}
                </span>
              ) : (
                <>
                  <span className="font-semibold text-neutral-900">
                    {reach.recipients} customer{reach.recipients === 1 ? "" : "s"}
                  </span>{" "}
                  will get this — {reach.devices} phone{reach.devices === 1 ? "" : "s"} can be pushed to now
                  {reach.recipients - reach.devices > 0 && `, ${reach.recipients - reach.devices} will see it in their app’s notification list`}
                  {reach.optedOut > 0 && ` (${reach.optedOut} switched this kind off)`}.
                </>
              )}
            </div>
          </div>

          {/* 3. message */}
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <label className="text-sm font-medium text-neutral-800">Title</label>
              <span className={`text-xs ${title.length > TITLE_MAX ? "text-red-600" : "text-neutral-400"}`}>
                {title.length}/{TITLE_MAX}
              </span>
            </div>
            <input
              className="input"
              placeholder="e.g. Monsoon sale — 10% off"
              value={title}
              maxLength={TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)}
            />
            <div className="mb-1 mt-3 flex items-baseline justify-between">
              <label className="text-sm font-medium text-neutral-800">Message</label>
              <span className={`text-xs ${body.length > BODY_MAX ? "text-red-600" : "text-neutral-400"}`}>
                {body.length}/{BODY_MAX}
              </span>
            </div>
            <textarea
              className="input min-h-24"
              placeholder="e.g. Book any tour before 30 Sept and save 10%. Use code MONSOON10 at checkout."
              value={body}
              maxLength={BODY_MAX}
              onChange={(e) => setBody(e.target.value)}
            />
            {activePromos.length > 0 && (
              <div className="mt-2 flex items-center gap-2 text-xs text-neutral-500">
                <span>Mention a promo code:</span>
                <select
                  className="input !w-auto !py-1 text-xs"
                  value=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const add = ` Use code ${e.target.value}.`;
                    if (!body.includes(e.target.value)) setBody((b) => (b + add).slice(0, BODY_MAX));
                  }}
                >
                  <option value="">Add to message…</option>
                  {activePromos.map((p) => (
                    <option key={p._id} value={p.code}>
                      {p.code}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* 4. where it opens */}
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-800">When they tap it, open…</label>
            <select className="input" value={opens} onChange={(e) => setOpens(e.target.value as Opens)}>
              {OPENS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {opens === "tour" && (
              <select className="input mt-2" value={openTourSlug} onChange={(e) => setOpenTourSlug(e.target.value)}>
                <option value="">Choose a tour…</option>
                {activeTours.map((t) => (
                  <option key={t._id} value={t.slug}>
                    {t.title}
                  </option>
                ))}
              </select>
            )}
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {result && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{result}</p>}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onSend}
              disabled={!canSend}
              className="rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sendMutation.isPending ? "Sending…" : "Send notification"}
            </button>
            {formError && <span className="text-xs text-neutral-400">{formError}</span>}
          </div>
        </div>

        {/* phone preview */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">How it will look</p>
          <div className="rounded-2xl border border-neutral-200 bg-neutral-200/60 p-4">
            <div className="rounded-2xl bg-white p-3 shadow">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-neutral-500">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white">F</span>
                Flying Leader · now
              </div>
              <p className="text-sm font-semibold text-neutral-900">{title.trim() || "Your title appears here"}</p>
              <p className="mt-0.5 whitespace-pre-line text-sm text-neutral-600">
                {body.trim() || "Your message appears here. Keep it short — most phones show about two lines."}
              </p>
            </div>
          </div>
          <p className="mt-2 text-xs text-neutral-400">
            Short titles and one clear action work best. Notifications reach phones that have the app installed and
            notifications allowed.
          </p>
        </div>
      </div>

      {/* history */}
      <h2 className="mb-2 mt-8 text-base font-semibold text-neutral-900">Sent so far</h2>
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
            <tr>
              <th className="px-4 py-2 font-medium">Sent</th>
              <th className="px-4 py-2 font-medium">Message</th>
              <th className="px-4 py-2 font-medium">Audience</th>
              <th className="px-4 py-2 font-medium">Reached</th>
              <th className="px-4 py-2 font-medium">By</th>
            </tr>
          </thead>
          <tbody>
            {(history ?? []).map((h) => (
              <tr key={h._id} className="border-b border-neutral-100 align-top last:border-0">
                <td className="whitespace-nowrap px-4 py-2 text-neutral-600">{new Date(h.createdAt).toLocaleString("en-IN")}</td>
                <td className="px-4 py-2">
                  <p className="font-medium text-neutral-900">{h.title}</p>
                  <p className="text-xs text-neutral-500">{h.body}</p>
                  <span className="mt-1 inline-block rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
                    {CATEGORY_LABEL[h.category]}
                  </span>
                </td>
                <td className="px-4 py-2 text-neutral-700">{audienceLabel(h.audience)}</td>
                <td className="px-4 py-2 text-neutral-700">
                  <span className="font-medium text-neutral-900">{h.stats.recipients}</span>{" "}
                  {h.stats.recipients === 1 ? "customer" : "customers"}
                  <div className="text-xs text-neutral-500">
                    {h.stats.sent} {h.stats.sent === 1 ? "phone" : "phones"} pushed{h.stats.failed ? `, ${h.stats.failed} failed` : ""}
                  </div>
                </td>
                <td className="px-4 py-2 text-neutral-600">{typeof h.sentBy === "object" ? h.sentBy.name : "—"}</td>
              </tr>
            ))}
            {history && history.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                  Nothing sent yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
