import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { RichTextEditor } from "../components/RichTextEditor";
import { api, apiErrorMessage } from "../lib/api";

type Tour = {
  _id: string;
  title: string;
  slug: string;
  shortDesc?: string;
  fullDesc?: string;
  location?: string;
  duration?: string;
  countryId?: string;
  category?: string;
  price: number;
  priceChild?: number;
  priceInfant?: number;
  childPricingTiers?: ChildPricingTier[];
  tokenAmount?: number;
  allowTokenPayment?: boolean;
  itinerary?: string;
  inclusions?: string;
  exclusions?: string;
  flightDetails?: string;
  showFlightDetails?: boolean;
  hotelDetails?: string;
  showHotelDetails?: boolean;
  totalSeats?: number;
  seatsAvailable?: number;
  seatsRemark?: string;
  groupSizeLabel?: string;
  hotelClassLabel?: string;
  isActive?: boolean;
};

type ChildPricingTier = { minAge: number; maxAge: number; price: number };
type Category = { _id: string; label: string; slug: string };
type Country = { _id: string; name: string };

const SEATS_REMARKS = ["Available", "Fast Selling", "Almost Sold Out", "Hot Selling", "Sold Out"];

const emptyForm: Record<string, unknown> = {
  title: "",
  shortDesc: "",
  fullDesc: "",
  location: "",
  duration: "",
  countryId: "",
  category: "",
  price: "",
  priceChild: "",
  priceInfant: "",
  childPricingTiers: [] as ChildPricingTier[],
  tokenAmount: "",
  allowTokenPayment: false,
  itinerary: "",
  inclusions: "",
  exclusions: "",
  flightDetails: "",
  showFlightDetails: false,
  hotelDetails: "",
  showHotelDetails: false,
  totalSeats: "",
  seatsAvailable: "",
  seatsRemark: "Available",
  groupSizeLabel: "",
  hotelClassLabel: "",
  isActive: true,
};

export function ToursPage() {
  const queryClient = useQueryClient();

  const { data: tours, isLoading, error } = useQuery({
    queryKey: ["/admin/tours"],
    queryFn: async () => (await api.get("/admin/tours")).data.items as Tour[],
  });
  const { data: categories } = useQuery({
    queryKey: ["/admin/categories"],
    queryFn: async () => (await api.get("/admin/categories")).data.items as Category[],
  });
  const { data: countries } = useQuery({
    queryKey: ["/admin/countries"],
    queryFn: async () => (await api.get("/admin/countries")).data.items as Country[],
  });

  const [editing, setEditing] = useState<Tour | null | undefined>(undefined);
  const [form, setForm] = useState<Record<string, unknown>>(emptyForm);
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setCoverImage(null);
    setFormError(null);
  }

  function openEdit(tour: Tour) {
    setEditing(tour);
    setForm({ ...emptyForm, ...tour });
    setCoverImage(null);
    setFormError(null);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = new FormData();
      for (const [key, value] of Object.entries(form)) {
        if (key === "_id" || key === "slug") continue;
        if (typeof value === "boolean") {
          body.append(key, String(value));
          continue;
        }
        if (Array.isArray(value)) {
          body.append(key, JSON.stringify(value));
          continue;
        }
        // Omit blank optional fields entirely rather than sending "" — an empty
        // string fails Mongoose's ObjectId cast on countryId, and is meaningless
        // for other optional numeric/text fields too.
        if (value === "" || value === null || value === undefined) continue;
        body.append(key, String(value));
      }
      if (coverImage) body.append("coverImage", coverImage);

      if (editing) return api.put(`/admin/tours/${editing._id}`, body);
      return api.post("/admin/tours", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/admin/tours"] });
      setEditing(undefined);
    },
    onError: (err) => setFormError(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/admin/tours/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/admin/tours"] }),
  });

  function set(name: string, value: unknown) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Tours</h1>
        <button
          onClick={openCreate}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          Add Tour
        </button>
      </div>

      {isLoading && <p className="text-slate-500">Loading…</p>}
      {error && <p className="text-red-600">{apiErrorMessage(error)}</p>}

      {tours && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 font-medium">Price</th>
                <th className="px-4 py-2 font-medium">Active</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {tours.map((tour) => (
                <tr key={tour._id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 text-slate-700">{tour.title}</td>
                  <td className="px-4 py-2 text-slate-700">{tour.category}</td>
                  <td className="px-4 py-2 text-slate-700">₹{tour.price?.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-2 text-slate-700">{tour.isActive ? "Yes" : "No"}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => openEdit(tour)} className="mr-3 text-slate-600 hover:underline">
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete "${tour.title}"?`)) deleteMutation.mutate(tour._id);
                      }}
                      className="text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {tours.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                    No tours yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing !== undefined && (
        <div className="fixed inset-0 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate();
            }}
            className="my-8 w-full max-w-2xl rounded-xl bg-white p-6 shadow-lg"
          >
            <h2 className="mb-4 text-base font-semibold text-slate-900">{editing ? "Edit Tour" : "New Tour"}</h2>

            {formError && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Title" required>
                <input className="input" value={form.title as string} onChange={(e) => set("title", e.target.value)} required />
              </Field>
              <Field label="Location">
                <input className="input" value={form.location as string} onChange={(e) => set("location", e.target.value)} />
              </Field>
              <Field label="Duration (e.g. 5 Days)">
                <input className="input" value={form.duration as string} onChange={(e) => set("duration", e.target.value)} />
              </Field>
              <Field label="Category">
                <select className="input" value={form.category as string} onChange={(e) => set("category", e.target.value)}>
                  <option value="">—</option>
                  {categories?.map((c) => (
                    <option key={c._id} value={c.slug}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Country">
                <select className="input" value={form.countryId as string} onChange={(e) => set("countryId", e.target.value)}>
                  <option value="">—</option>
                  {countries?.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Price (adult, ₹)" required>
                <input type="number" min="0" className="input" value={form.price as string} onChange={(e) => set("price", e.target.value)} required />
              </Field>
              <Field label="Price (child, ₹) — fallback if no age tiers below">
                <input type="number" min="0" className="input" value={form.priceChild as string} onChange={(e) => set("priceChild", e.target.value)} />
              </Field>
              <Field label="Price (infant, ₹)">
                <input type="number" min="0" className="input" value={form.priceInfant as string} onChange={(e) => set("priceInfant", e.target.value)} />
              </Field>
              <Field label="Group size label">
                <input className="input" value={form.groupSizeLabel as string} onChange={(e) => set("groupSizeLabel", e.target.value)} />
              </Field>
              <Field label="Hotel class label">
                <input className="input" value={form.hotelClassLabel as string} onChange={(e) => set("hotelClassLabel", e.target.value)} />
              </Field>
              <Field label="Total seats">
                <input type="number" min="0" className="input" value={form.totalSeats as string} onChange={(e) => set("totalSeats", e.target.value)} />
              </Field>
              <Field label="Seats available">
                <input type="number" min="0" className="input" value={form.seatsAvailable as string} onChange={(e) => set("seatsAvailable", e.target.value)} />
              </Field>
              <Field label="Seats remark">
                <select className="input" value={form.seatsRemark as string} onChange={(e) => set("seatsRemark", e.target.value)}>
                  {SEATS_REMARKS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Cover image">
                <input type="file" accept="image/*" onChange={(e) => setCoverImage(e.target.files?.[0] ?? null)} className="text-sm" />
              </Field>
            </div>

            <Field label="Short description" className="mt-3">
              <RichTextEditor
                value={form.shortDesc as string}
                onChange={(html) => set("shortDesc", html)}
                minHeight={70}
                placeholder="A one-line teaser shown near the title"
              />
            </Field>
            <Field label="Full description" className="mt-3">
              <RichTextEditor value={form.fullDesc as string} onChange={(html) => set("fullDesc", html)} minHeight={160} />
            </Field>
            <Field label="Itinerary" className="mt-3">
              <RichTextEditor value={form.itinerary as string} onChange={(html) => set("itinerary", html)} minHeight={200} />
            </Field>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Inclusions">
                <RichTextEditor value={form.inclusions as string} onChange={(html) => set("inclusions", html)} minHeight={140} />
              </Field>
              <Field label="Exclusions">
                <RichTextEditor value={form.exclusions as string} onChange={(html) => set("exclusions", html)} minHeight={140} />
              </Field>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">Child pricing by age (optional)</p>
                <button
                  type="button"
                  onClick={() =>
                    set("childPricingTiers", [
                      ...((form.childPricingTiers as ChildPricingTier[]) ?? []),
                      { minAge: 0, maxAge: 0, price: 0 },
                    ])
                  }
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  + Add age band
                </button>
              </div>
              <p className="mb-2 text-xs text-slate-500">
                If set, a child's exact age picks the matching band below; otherwise the flat "Price (child)" above is used.
              </p>
              {((form.childPricingTiers as ChildPricingTier[]) ?? []).map((tier, i) => (
                <div key={i} className="mb-2 flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    placeholder="Min age"
                    className="input"
                    value={tier.minAge}
                    onChange={(e) => {
                      const tiers = [...((form.childPricingTiers as ChildPricingTier[]) ?? [])];
                      tiers[i] = { ...tiers[i], minAge: Number(e.target.value) };
                      set("childPricingTiers", tiers);
                    }}
                  />
                  <span className="text-slate-400">to</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="Max age"
                    className="input"
                    value={tier.maxAge}
                    onChange={(e) => {
                      const tiers = [...((form.childPricingTiers as ChildPricingTier[]) ?? [])];
                      tiers[i] = { ...tiers[i], maxAge: Number(e.target.value) };
                      set("childPricingTiers", tiers);
                    }}
                  />
                  <span className="text-slate-400">yrs @ ₹</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="Price"
                    className="input"
                    value={tier.price}
                    onChange={(e) => {
                      const tiers = [...((form.childPricingTiers as ChildPricingTier[]) ?? [])];
                      tiers[i] = { ...tiers[i], price: Number(e.target.value) };
                      set("childPricingTiers", tiers);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const tiers = [...((form.childPricingTiers as ChildPricingTier[]) ?? [])];
                      tiers.splice(i, 1);
                      set("childPricingTiers", tiers);
                    }}
                    className="shrink-0 text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!form.showFlightDetails}
                  onChange={(e) => set("showFlightDetails", e.target.checked)}
                />
                Show flight details
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!form.showHotelDetails}
                  onChange={(e) => set("showHotelDetails", e.target.checked)}
                />
                Show hotel details
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!form.allowTokenPayment}
                  onChange={(e) => set("allowTokenPayment", e.target.checked)}
                />
                Allow token (partial) payment
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={!!form.isActive} onChange={(e) => set("isActive", e.target.checked)} />
                Active
              </label>
            </div>

            {!!form.showFlightDetails && (
              <Field label="Flight details" className="mt-3">
                <textarea
                  className="input"
                  rows={3}
                  placeholder="e.g. Delhi (DEL) → Male (MLE), Air India AI441, 10:30 – 13:15"
                  value={form.flightDetails as string}
                  onChange={(e) => set("flightDetails", e.target.value)}
                />
              </Field>
            )}

            {!!form.showHotelDetails && (
              <Field label="Hotel details" className="mt-3">
                <textarea className="input" rows={3} value={form.hotelDetails as string} onChange={(e) => set("hotelDetails", e.target.value)} />
              </Field>
            )}

            {!!form.allowTokenPayment && (
              <Field label="Token amount (₹)" className="mt-3 max-w-xs">
                <input type="number" min="0" className="input" value={form.tokenAmount as string} onChange={(e) => set("tokenAmount", e.target.value)} />
              </Field>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(undefined)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saveMutation.isPending}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {saveMutation.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block text-sm ${className ?? ""}`}>
      <span className="mb-1 block font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  );
}
