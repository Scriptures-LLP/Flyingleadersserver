import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { Icon } from "../components/icons";
import { ImageCropModal } from "../components/ImageCropModal";
import { RichTextEditor } from "../components/RichTextEditor";
import { StagedGalleryUploader } from "../components/StagedGalleryUploader";
import { StatusBadge } from "../components/StatusBadge";
import { TourGalleryManager } from "../components/TourGalleryManager";
import { api, apiErrorMessage } from "../lib/api";
import { COVER_CROP } from "../lib/coverCrop";

type Tour = {
  _id: string;
  title: string;
  slug: string;
  coverImageUrl?: string | null;
  shortDesc?: string;
  fullDesc?: string;
  location?: string;
  duration?: string;
  countryId?: string;
  category?: string;
  category2?: string;
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
  category2: "",
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

  const catLabel = (slug?: string) => categories?.find((c) => c.slug === slug)?.label ?? slug ?? "";

  const [editing, setEditing] = useState<Tour | null | undefined>(undefined);
  const [form, setForm] = useState<Record<string, unknown>>(emptyForm);
  const [coverImage, setCoverImage] = useState<File | null>(null);
  // Set when the user clears an already-saved cover — tells the server to drop it.
  const [removeCover, setRemoveCover] = useState(false);
  // Gallery images staged while creating a tour (uploaded once it has an id).
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  // A just-picked cover being adjusted in the crop dialog.
  const [coverCropFile, setCoverCropFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Preview: the freshly-picked file if any, otherwise the tour's saved cover
  // (unless it's been cleared).
  const newCoverPreview = useMemo(
    () => (coverImage ? URL.createObjectURL(coverImage) : null),
    [coverImage],
  );
  useEffect(() => {
    return () => {
      if (newCoverPreview) URL.revokeObjectURL(newCoverPreview);
    };
  }, [newCoverPreview]);
  const coverPreview = newCoverPreview ?? (removeCover ? null : editing?.coverImageUrl ?? null);

  function pickCover(file: File | null) {
    setCoverImage(file);
    if (file) setRemoveCover(false);
  }

  function clearCover() {
    if (coverImage) {
      setCoverImage(null); // undo a fresh pick, fall back to the saved cover
    } else {
      setRemoveCover(true); // remove the already-saved cover on save
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setCoverImage(null);
    setRemoveCover(false);
    setGalleryFiles([]);
    setFormError(null);
  }

  function openEdit(tour: Tour) {
    setEditing(tour);
    setForm({ ...emptyForm, ...tour });
    setCoverImage(null);
    setRemoveCover(false);
    setGalleryFiles([]);
    setFormError(null);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = new FormData();
      // Only send the editable fields (the keys we actually render inputs for).
      // Iterating the whole `form` object would also re-send server-managed
      // fields the edit view was seeded with — notably the old `coverImage`
      // storage key and `coverImageUrl` — and a stale `coverImage` text field
      // collides with the uploaded cover file below (same multipart field name),
      // so the new cover never takes effect.
      for (const key of Object.keys(emptyForm)) {
        const value = form[key];
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
      else if (removeCover) body.append("coverImage", ""); // clear the saved cover

      if (editing) return api.put(`/admin/tours/${editing._id}`, body);

      // Create, then push any gallery images staged during the add form now that
      // the new tour has an id to attach them to.
      const res = await api.post("/admin/tours", body);
      const newId = res.data?.item?._id as string | undefined;
      if (newId && galleryFiles.length > 0) {
        const gallery = new FormData();
        gallery.append("tourId", newId);
        galleryFiles.forEach((f) => gallery.append("files", f));
        await api.post("/admin/tour-media", gallery, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
      return res;
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
        <div className="flex items-center gap-2.5">
          <span className="h-6 w-1.5 rounded-full bg-gradient-to-b from-red-500 to-red-600" />
          <h1 className="text-xl font-bold tracking-tight text-neutral-900">Tours</h1>
        </div>
        <button
          onClick={openCreate}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
        >
          Add Tour
        </button>
      </div>

      {isLoading && <p className="text-neutral-500">Loading…</p>}
      {error && <p className="text-red-600">{apiErrorMessage(error)}</p>}

      {tours && (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
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
                <tr key={tour._id} className="border-b border-neutral-100 last:border-0">
                  <td className="px-4 py-2 text-neutral-700">{tour.title}</td>
                  <td className="px-4 py-2 text-neutral-700">
                    {[tour.category, tour.category2].filter(Boolean).map(catLabel).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-2 text-neutral-700">₹{tour.price?.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-2 text-neutral-700">
                    <StatusBadge active={tour.isActive} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(tour)}
                        title="Edit"
                        aria-label="Edit"
                        className="rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
                      >
                        <Icon name="edit" className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete "${tour.title}"?`)) deleteMutation.mutate(tour._id);
                        }}
                        title="Delete"
                        aria-label="Delete"
                        className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {tours.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                    No tours yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing !== undefined && (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-neutral-900/40 p-4 backdrop-blur-sm">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate();
            }}
            className="my-8 w-full max-w-2xl rounded-xl bg-white p-6 shadow-lg"
          >
            <h2 className="mb-4 text-base font-semibold text-neutral-900">{editing ? "Edit Tour" : "New Tour"}</h2>

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
              <Field label="Category 1">
                <select className="input" value={form.category as string} onChange={(e) => set("category", e.target.value)}>
                  <option value="">—</option>
                  {categories?.map((c) => (
                    <option key={c._id} value={c.slug}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Category 2 (optional)">
                <select className="input" value={form.category2 as string} onChange={(e) => set("category2", e.target.value)}>
                  <option value="">—</option>
                  {categories
                    ?.filter((c) => c.slug !== form.category)
                    .map((c) => (
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
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const picked = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    if (picked) setCoverCropFile(picked);
                  }}
                  className="w-full text-sm text-neutral-500 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-red-600 file:px-3 file:py-1 file:text-xs file:font-medium file:text-white hover:file:bg-red-700"
                />
                {coverPreview && (
                  <div className="relative mt-2 h-28 w-full">
                    <img
                      src={coverPreview}
                      alt="Cover preview"
                      className="h-full w-full rounded-md border border-neutral-200 object-cover"
                    />
                    <button
                      type="button"
                      onClick={clearCover}
                      title="Remove cover image"
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-sm font-bold text-white shadow hover:bg-red-700"
                    >
                      ×
                    </button>
                  </div>
                )}
              </Field>
            </div>

            {editing?._id ? (
              <TourGalleryManager tourId={editing._id} />
            ) : (
              <StagedGalleryUploader files={galleryFiles} onChange={setGalleryFiles} />
            )}

            <Field label="Short description" className="mt-3">
              <RichTextEditor
                value={form.shortDesc as string}
                onChange={(html) => set("shortDesc", html)}
                minHeight={70}
                placeholder="A one-line teaser shown near the title"
              />
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

            <div className="mt-4 rounded-lg border border-neutral-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-neutral-700">Child pricing by age (optional)</p>
                <button
                  type="button"
                  onClick={() =>
                    set("childPricingTiers", [
                      ...((form.childPricingTiers as ChildPricingTier[]) ?? []),
                      { minAge: 0, maxAge: 0, price: 0 },
                    ])
                  }
                  className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  + Add age band
                </button>
              </div>
              <p className="mb-2 text-xs text-neutral-500">
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
                  <span className="text-neutral-400">to</span>
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
                  <span className="text-neutral-400">yrs @ ₹</span>
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
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saveMutation.isPending}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {saveMutation.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}

      {coverCropFile && (
        <ImageCropModal
          file={coverCropFile}
          aspect={COVER_CROP.tour.aspect}
          outputWidth={COVER_CROP.tour.outputWidth}
          label="Tour cover"
          onCancel={() => setCoverCropFile(null)}
          onConfirm={(cropped) => {
            pickCover(cropped);
            setCoverCropFile(null);
          }}
        />
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
      <span className="mb-1 block font-medium text-neutral-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  );
}
