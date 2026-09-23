import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useState } from "react";

import { api, apiErrorMessage } from "../lib/api";
import { Icon } from "./icons";
import { ImageCropModal } from "./ImageCropModal";

// Singular form of a resource title for buttons/labels ("Add Country", not
// "Add Countrie"): "Countries" → "Country", "Categories" → "Category",
// "Airports" → "Airport", while leaving already-singular titles untouched.
function singularize(title: string) {
  if (/ies$/i.test(title)) return title.replace(/ies$/i, "y");
  if (/(ss|us)$/i.test(title)) return title; // e.g. "Address", "Status"
  return title.replace(/s$/, "");
}

export type FieldConfig =
  | { name: string; label: string; type: "text" | "number" | "date" | "datetime-local"; required?: boolean }
  | { name: string; label: string; type: "checkbox" }
  // `previewUrlKey` is the field on the item holding the existing image's URL,
  // so the form can show a thumbnail of what's already uploaded. `crop` opens
  // the adjust/crop dialog on selection to fit the app's required dimensions.
  | {
      name: string;
      label: string;
      type: "file";
      accept?: string;
      previewUrlKey?: string;
      crop?: { aspect: number; outputWidth: number };
    }
  | {
      name: string;
      label: string;
      type: "select";
      options: { value: string; label: string }[];
      required?: boolean;
      allowBlank?: boolean;
    };

export type ColumnConfig<T> = {
  key: string;
  label: string;
  render?: (item: T) => React.ReactNode;
};

type Props<T extends { _id: string }> = {
  title: string;
  subtitle?: string; // small helper line under the title (e.g. where it appears in the app)
  resourcePath: string; // e.g. "/admin/airports"
  columns: ColumnConfig<T>[];
  fields: FieldConfig[];
  // Optional row ordering for the list table — e.g. group all of one tour's
  // rows together. Applied as a stable sort over the fetched items.
  sortItems?: (a: T, b: T) => number;
  // Optional grouping — renders a filter dropdown (so one group can be viewed
  // on its own) plus a section header before each group's rows. `value` is the
  // group's stable id, `display` its human label (e.g. a tour title).
  groupBy?: {
    label: string;
    value: (item: T) => string;
    display: (item: T) => string;
  };
};

// A bare "datetime-local" input value ("2026-09-20T09:00") has no timezone,
// so `new Date(...)` on the server interprets it in the SERVER's timezone —
// wrong whenever that isn't also IST. The admin panel and its users are both
// India-only, so pin it to IST explicitly rather than trusting either side's
// ambient timezone.
function withIstOffset(value: unknown): unknown {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return `${value}:00+05:30`;
  }
  return value;
}

function buildPayload(fields: FieldConfig[], values: Record<string, unknown>, files: Record<string, File | null>) {
  const hasFile = fields.some((f) => f.type === "file" && files[f.name]);
  if (!hasFile) {
    const body: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.type === "file") continue;
      if (f.type === "checkbox") {
        body[f.name] = !!values[f.name];
        continue;
      }
      // Omit blank optional fields entirely — an empty string fails Mongoose's
      // ObjectId cast on a "select" ref field, and is meaningless for others too.
      const v = values[f.name];
      if (v === "" || v === null || v === undefined) continue;
      body[f.name] = f.type === "datetime-local" ? withIstOffset(v) : v;
    }
    return body;
  }

  const form = new FormData();
  for (const f of fields) {
    if (f.type === "file") {
      if (files[f.name]) form.append(f.name, files[f.name] as File);
      continue;
    }
    const v = f.type === "checkbox" ? !!values[f.name] : (values[f.name] ?? "");
    form.append(f.name, String(f.type === "datetime-local" ? withIstOffset(v) : v));
  }
  return form;
}

export function ResourceCrudPage<T extends { _id: string; isActive?: boolean }>({
  title,
  subtitle,
  resourcePath,
  columns,
  fields,
  sortItems,
  groupBy,
}: Props<T>) {
  const queryClient = useQueryClient();
  const queryKey = [resourcePath];

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => (await api.get(resourcePath)).data.items as T[],
  });

  // Order rows for display without mutating the cached query data.
  const rows = useMemo(() => (data && sortItems ? [...data].sort(sortItems) : data), [data, sortItems]);

  // Which group is being viewed on its own ("" = show every group).
  const [groupFilter, setGroupFilter] = useState<string>("");

  // Cluster the (already sorted) rows into groups, preserving first-seen order.
  const groups = useMemo(() => {
    if (!rows || !groupBy) return null;
    const order: string[] = [];
    const map = new Map<string, { id: string; label: string; items: T[] }>();
    for (const item of rows) {
      const id = groupBy.value(item);
      let g = map.get(id);
      if (!g) {
        g = { id, label: groupBy.display(item), items: [] };
        map.set(id, g);
        order.push(id);
      }
      g.items.push(item);
    }
    return order.map((id) => map.get(id)!);
  }, [rows, groupBy]);

  const visibleGroups = groups && (groupFilter ? groups.filter((g) => g.id === groupFilter) : groups);

  const [modalItem, setModalItem] = useState<T | null | undefined>(undefined); // undefined = closed, null = create
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [formFiles, setFormFiles] = useState<Record<string, File | null>>({});
  const [formError, setFormError] = useState<string | null>(null);
  // The image currently being adjusted in the crop dialog, if any.
  const [cropTarget, setCropTarget] = useState<{ field: FieldConfig & { type: "file" }; file: File } | null>(null);
  // The preview image being viewed full screen, if any.
  const [lightbox, setLightbox] = useState<string | null>(null);

  // Object-URL previews for freshly-picked files (revoked on change/unmount).
  const filePreviews = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [name, file] of Object.entries(formFiles)) {
      if (file) map[name] = URL.createObjectURL(file);
    }
    return map;
  }, [formFiles]);
  useEffect(() => {
    return () => Object.values(filePreviews).forEach((url) => URL.revokeObjectURL(url));
  }, [filePreviews]);

  function openCreate() {
    setModalItem(null);
    setFormValues(
      Object.fromEntries(
        fields.map((f) => {
          if (f.type === "checkbox") return [f.name, true];
          // A required select with no blank option can't actually represent ""
          // in the DOM — the browser silently falls back to showing the first
          // option while our state stays at "", so an untouched field looks
          // filled in but submits as missing and fails server-side validation.
          // Seed it with the first real option so state matches what's shown.
          if (f.type === "select" && f.allowBlank === false && f.options.length > 0) {
            return [f.name, f.options[0].value];
          }
          return [f.name, ""];
        }),
      ),
    );
    setFormFiles({});
    setFormError(null);
  }

  function openEdit(item: T) {
    setModalItem(item);
    const values: Record<string, unknown> = { ...item };
    // Server sends full ISO timestamps; a "date" input needs "YYYY-MM-DD" and a
    // "datetime-local" input needs "YYYY-MM-DDTHH:mm", both in IST wall-clock
    // time. An unconverted ISO string is rejected by the input, leaving it
    // blank — which then fails the `required` check on save (e.g. tour dates).
    for (const f of fields) {
      if (f.type !== "datetime-local" && f.type !== "date") continue;
      const raw = values[f.name];
      if (typeof raw === "string" && raw) {
        const ist = new Date(new Date(raw).getTime() + 5.5 * 60 * 60 * 1000).toISOString();
        values[f.name] = ist.slice(0, f.type === "date" ? 10 : 16);
      }
    }
    setFormValues(values);
    setFormFiles({});
    setFormError(null);
  }

  function closeModal() {
    setModalItem(undefined);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload(fields, formValues, formFiles);
      const config = payload instanceof FormData ? { headers: { "Content-Type": "multipart/form-data" } } : {};
      if (modalItem) {
        return api.put(`${resourcePath}/${modalItem._id}`, payload, config);
      }
      return api.post(resourcePath, payload, config);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      closeModal();
    },
    onError: (err) => setFormError(apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`${resourcePath}/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const renderItemRow = (item: T) => (
    <tr key={item._id} className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-neutral-50/70">
      {columns.map((c) => (
        <td key={c.key} className="px-4 py-2 text-neutral-700">
          {c.render ? c.render(item) : String((item as Record<string, unknown>)[c.key] ?? "")}
        </td>
      ))}
      <td className="px-4 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => openEdit(item)}
            title="Edit"
            aria-label="Edit"
            className="rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
          >
            <Icon name="edit" className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete this ${singularize(title).toLowerCase()}?`)) {
                deleteMutation.mutate(item._id);
              }
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
  );

  return (
    <div>
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="h-6 w-1.5 rounded-full bg-gradient-to-b from-red-500 to-red-600" />
            <h1 className="text-xl font-bold tracking-tight text-neutral-900">{title}</h1>
            {rows && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                {rows.length}
              </span>
            )}
          </div>
          {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
        </div>
        <button
          onClick={openCreate}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-b from-red-500 to-red-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-red-600/30 transition-all hover:from-red-600 hover:to-red-700 hover:shadow-md hover:shadow-red-600/30 active:scale-[.98]"
        >
          <span className="text-base leading-none">+</span>
          Add {singularize(title)}
        </button>
      </div>

      {isLoading && <p className="text-neutral-500">Loading…</p>}
      {error && <p className="text-red-600">{apiErrorMessage(error)}</p>}

      {groups && groups.length > 0 && groupBy && (
        <div className="mb-3 flex items-center gap-2 text-sm">
          <label className="font-medium text-neutral-600">{groupBy.label}:</label>
          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            className="rounded-md border border-neutral-300 px-2 py-1 outline-none focus:border-red-500"
          >
            <option value="">All ({groups.length})</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label} ({g.items.length})
              </option>
            ))}
          </select>
        </div>
      )}

      {rows && (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-500">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide">
                    {c.label}
                  </th>
                ))}
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {visibleGroups
                ? visibleGroups.map((g) => (
                    <Fragment key={g.id}>
                      {/* Show the group header only when several groups are on
                          screen — with a single group it just repeats the filter. */}
                      {(visibleGroups.length > 1 || !groupFilter) && (
                        <tr className="border-b border-neutral-200 bg-neutral-100">
                          <td
                            colSpan={columns.length + 1}
                            className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-600"
                          >
                            {g.label} · {g.items.length}
                          </td>
                        </tr>
                      )}
                      {g.items.map(renderItemRow)}
                    </Fragment>
                  ))
                : rows.map(renderItemRow)}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="px-4 py-6 text-center text-neutral-400">
                    Nothing here yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modalItem !== undefined && (
        <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-neutral-900/40 p-4 backdrop-blur-sm">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate();
            }}
            className="my-8 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <h2 className="mb-4 text-base font-semibold text-neutral-900">
              {modalItem ? `Edit ${singularize(title)}` : `New ${singularize(title)}`}
            </h2>

            {formError && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>}

            <div className="flex flex-col gap-3">
              {fields.map((f) =>
                f.type === "file" ? (
                  // A file field must NOT be wrapped in a <label>: a label forwards
                  // clicks on any descendant (including the preview image) to its
                  // control, which would re-open the file picker when the user just
                  // wants to look at the picked image.
                  <div key={f.name} className="block text-sm">
                    <span className="mb-1 block font-medium text-neutral-700">{f.label}</span>
                    <input
                      type="file"
                      accept={f.accept ?? "image/*"}
                      onChange={(e) => {
                        const picked = e.target.files?.[0] ?? null;
                        e.target.value = ""; // allow re-selecting the same file
                        if (picked && f.crop) setCropTarget({ field: f, file: picked });
                        else setFormFiles((v) => ({ ...v, [f.name]: picked }));
                      }}
                      className="w-full text-sm text-neutral-500 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-red-600 file:px-3 file:py-1 file:text-xs file:font-medium file:text-white hover:file:bg-red-700"
                    />
                    {(() => {
                      const picked = !!formFiles[f.name];
                      const preview =
                        filePreviews[f.name] ??
                        (f.previewUrlKey && modalItem
                          ? ((modalItem as Record<string, unknown>)[f.previewUrlKey] as string | undefined)
                          : undefined);
                      return preview ? (
                        <div className="relative mt-2 w-full">
                          <img
                            src={preview}
                            alt={`${f.label} preview`}
                            onClick={() => setLightbox(preview)}
                            className="max-h-48 w-full cursor-zoom-in rounded-md border border-neutral-200 bg-neutral-50 object-contain"
                          />
                          {picked && (
                            <button
                              type="button"
                              aria-label="Remove selected image"
                              title="Remove selected image"
                              onClick={() => setFormFiles((v) => ({ ...v, [f.name]: null }))}
                              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-sm font-bold leading-none text-white hover:bg-black/80"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ) : null;
                    })()}
                  </div>
                ) : (
                <label key={f.name} className="block text-sm">
                  <span className="mb-1 block font-medium text-neutral-700">{f.label}</span>
                  {f.type === "checkbox" ? (
                    <input
                      type="checkbox"
                      checked={!!formValues[f.name]}
                      onChange={(e) => setFormValues((v) => ({ ...v, [f.name]: e.target.checked }))}
                    />
                  ) : f.type === "select" ? (
                    <select
                      required={f.required}
                      value={(formValues[f.name] as string | undefined) ?? ""}
                      onChange={(e) => setFormValues((v) => ({ ...v, [f.name]: e.target.value }))}
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                    >
                      {(f.allowBlank ?? true) && <option value="">—</option>}
                      {f.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={f.type}
                      required={f.required}
                      min={f.type === "number" ? 0 : undefined}
                      value={(formValues[f.name] as string | number | undefined) ?? ""}
                      onChange={(e) => setFormValues((v) => ({ ...v, [f.name]: e.target.value }))}
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                    />
                  )}
                </label>
                ),
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
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

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-2xl font-bold leading-none text-white hover:bg-black/80"
          >
            ×
          </button>
          <img
            src={lightbox}
            alt="Full screen preview"
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-md object-contain"
          />
        </div>
      )}

      {cropTarget && cropTarget.field.crop && (
        <ImageCropModal
          file={cropTarget.file}
          aspect={cropTarget.field.crop.aspect}
          outputWidth={cropTarget.field.crop.outputWidth}
          label={cropTarget.field.label}
          onCancel={() => setCropTarget(null)}
          onConfirm={(cropped) => {
            setFormFiles((v) => ({ ...v, [cropTarget.field.name]: cropped }));
            setCropTarget(null);
          }}
        />
      )}
    </div>
  );
}
