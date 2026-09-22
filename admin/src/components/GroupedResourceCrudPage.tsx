import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { api, apiErrorMessage } from "../lib/api";
import { ResourceFormModal } from "./ResourceFormModal";
import { useResourceForm, type FieldConfig } from "./resourceForm";

type Tour = { _id: string; title: string; coverImageUrl?: string | null };

type Props<T extends { _id: string; tourId: string }> = {
  title: string; // e.g. "Tour Dates"
  resourcePath: string;
  fields: FieldConfig[];
  /** Field name on the item that names the tour — used to pre-fill "Add" inside a container. */
  tourField?: string;
  /** One row inside a tour's container. */
  renderRow: (item: T, actions: { onEdit: () => void; onDelete: () => void }) => React.ReactNode;
  /** Column headings for the row table (must line up with renderRow's cells, action column added automatically). */
  rowColumns: string[];
  /** Sorts a tour's own rows before rendering (e.g. by date). */
  sortRows?: (a: T, b: T) => number;
  emptyRowLabel: string;
};

/**
 * The same create/edit/delete machinery as ResourceCrudPage, but the list is
 * one collapsible container per Tour instead of a single flat table — so an
 * admin managing several dates or airport prices per tour (often several rows
 * per departure airport) can see, at a glance, exactly what's configured for
 * one tour without it running together with every other tour's rows.
 */
export function GroupedResourceCrudPage<T extends { _id: string; tourId: string; isActive?: boolean }>({
  title,
  resourcePath,
  fields,
  tourField = "tourId",
  renderRow,
  rowColumns,
  sortRows,
  emptyRowLabel,
}: Props<T>) {
  const form = useResourceForm<T>(resourcePath, fields);
  const { data, isLoading, error, modalItem, openCreate, openEdit, deleteMutation } = form;
  const singular = title.replace(/s$/, "");

  const { data: tours } = useQuery({
    queryKey: ["/admin/tours"],
    queryFn: async () => (await api.get("/admin/tours")).data.items as Tour[],
  });

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const byTour = new Map<string, T[]>();
    for (const item of data ?? []) {
      const list = byTour.get(item.tourId) ?? [];
      list.push(item);
      byTour.set(item.tourId, list);
    }
    // One container per tour that HAS at least one row, ordered like the tour
    // list itself, plus a trailing group for rows whose tour no longer exists
    // (deleted tour) so nothing configured is ever silently hidden.
    const known = (tours ?? []).map((t) => ({ tour: t, items: byTour.get(t._id) ?? [] })).filter((g) => g.items.length > 0);
    const knownIds = new Set((tours ?? []).map((t) => t._id));
    const orphanIds = [...byTour.keys()].filter((id) => !knownIds.has(id));
    const orphaned = orphanIds.map((id) => ({ tour: { _id: id, title: "(deleted tour)" } as Tour, items: byTour.get(id)! }));
    const all = [...known, ...orphaned];
    if (sortRows) for (const g of all) g.items.sort(sortRows);
    const q = search.trim().toLowerCase();
    return q ? all.filter((g) => g.tour.title.toLowerCase().includes(q)) : all;
  }, [data, tours, search, sortRows]);

  const toggle = (tourId: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(tourId)) next.delete(tourId);
      else next.add(tourId);
      return next;
    });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          <p className="mt-0.5 text-xs text-slate-500">One container per tour — click a tour to see its {title.toLowerCase()}.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tours…"
            className="w-48 rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-red-500"
          />
          <button
            onClick={() => setOpen(new Set(groups.map((g) => g.tour._id)))}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            Expand all
          </button>
          <button
            onClick={() => setOpen(new Set())}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            Collapse all
          </button>
          <button
            onClick={() => openCreate()}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            Add {singular}
          </button>
        </div>
      </div>

      {isLoading && <p className="text-slate-500">Loading…</p>}
      {error && <p className="text-red-600">{apiErrorMessage(error)}</p>}

      {data && groups.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
          {search ? "No tours match that search." : `No ${title.toLowerCase()} yet — click "Add ${singular}" to create one.`}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {groups.map(({ tour, items }) => {
          const isOpen = open.has(tour._id);
          return (
            <div key={tour._id} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <button
                onClick={() => toggle(tour._id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {tour.coverImageUrl ? (
                    <img src={tour.coverImageUrl} alt="" className="h-10 w-14 shrink-0 rounded-md object-cover" />
                  ) : (
                    <div className="h-10 w-14 shrink-0 rounded-md bg-slate-100" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{tour.title}</p>
                    <p className="text-xs text-slate-500">
                      {items.length} {items.length === 1 ? singular.toLowerCase() : title.toLowerCase()}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      openCreate({ [tourField]: tour._id });
                    }}
                    onKeyDown={(e) => e.key === "Enter" && e.stopPropagation()}
                    className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                  >
                    + Add here
                  </span>
                  <span className={`text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}>▾</span>
                </div>
              </button>

              {isOpen && (
                <div className="overflow-x-auto border-t border-slate-100">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        {rowColumns.map((c) => (
                          <th key={c} className="px-4 py-2 font-medium">
                            {c}
                          </th>
                        ))}
                        <th className="px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item._id} className="border-b border-slate-100 last:border-0">
                          {renderRow(item, {
                            onEdit: () => openEdit(item),
                            onDelete: () => {
                              if (confirm(`Delete this ${singular.toLowerCase()}?`)) deleteMutation.mutate(item._id);
                            },
                          })}
                        </tr>
                      ))}
                      {items.length === 0 && (
                        <tr>
                          <td colSpan={rowColumns.length + 1} className="px-4 py-4 text-center text-slate-400">
                            {emptyRowLabel}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ResourceFormModal<T>
        title={singular}
        fields={fields}
        closeModal={form.closeModal}
        modalItem={modalItem}
        formValues={form.formValues}
        setFormValues={form.setFormValues}
        formFiles={form.formFiles}
        setFormFiles={form.setFormFiles}
        formError={form.formError}
        cropTarget={form.cropTarget}
        setCropTarget={form.setCropTarget}
        lightbox={form.lightbox}
        setLightbox={form.setLightbox}
        filePreviews={form.filePreviews}
        saveMutation={form.saveMutation}
      />
    </div>
  );
}
