import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api, apiErrorMessage } from "../lib/api";

export type FieldConfig =
  | { name: string; label: string; type: "text" | "number" | "date" | "datetime-local"; required?: boolean }
  | { name: string; label: string; type: "checkbox" }
  | { name: string; label: string; type: "file"; accept?: string }
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
  resourcePath: string; // e.g. "/admin/airports"
  columns: ColumnConfig<T>[];
  fields: FieldConfig[];
};

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
      body[f.name] = v;
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
    form.append(f.name, String(v));
  }
  return form;
}

export function ResourceCrudPage<T extends { _id: string; isActive?: boolean }>({
  title,
  resourcePath,
  columns,
  fields,
}: Props<T>) {
  const queryClient = useQueryClient();
  const queryKey = [resourcePath];

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => (await api.get(resourcePath)).data.items as T[],
  });

  const [modalItem, setModalItem] = useState<T | null | undefined>(undefined); // undefined = closed, null = create
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [formFiles, setFormFiles] = useState<Record<string, File | null>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function openCreate() {
    setModalItem(null);
    setFormValues(Object.fromEntries(fields.map((f) => [f.name, f.type === "checkbox" ? true : ""])));
    setFormFiles({});
    setFormError(null);
  }

  function openEdit(item: T) {
    setModalItem(item);
    setFormValues({ ...item });
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

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        <button
          onClick={openCreate}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          Add {title.replace(/s$/, "")}
        </button>
      </div>

      {isLoading && <p className="text-slate-500">Loading…</p>}
      {error && <p className="text-red-600">{apiErrorMessage(error)}</p>}

      {data && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className="px-4 py-2 font-medium">
                    {c.label}
                  </th>
                ))}
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr key={item._id} className="border-b border-slate-100 last:border-0">
                  {columns.map((c) => (
                    <td key={c.key} className="px-4 py-2 text-slate-700">
                      {c.render ? c.render(item) : String((item as Record<string, unknown>)[c.key] ?? "")}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => openEdit(item)} className="mr-3 text-slate-600 hover:underline">
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete this ${title.toLowerCase().replace(/s$/, "")}?`)) {
                          deleteMutation.mutate(item._id);
                        }
                      }}
                      className="text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="px-4 py-6 text-center text-slate-400">
                    Nothing here yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modalItem !== undefined && (
        <div className="fixed inset-0 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate();
            }}
            className="my-8 w-full max-w-md rounded-xl bg-white p-6 shadow-lg"
          >
            <h2 className="mb-4 text-base font-semibold text-slate-900">
              {modalItem ? `Edit ${title.replace(/s$/, "")}` : `New ${title.replace(/s$/, "")}`}
            </h2>

            {formError && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>}

            <div className="flex flex-col gap-3">
              {fields.map((f) => (
                <label key={f.name} className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">{f.label}</span>
                  {f.type === "checkbox" ? (
                    <input
                      type="checkbox"
                      checked={!!formValues[f.name]}
                      onChange={(e) => setFormValues((v) => ({ ...v, [f.name]: e.target.checked }))}
                    />
                  ) : f.type === "file" ? (
                    <input
                      type="file"
                      accept={f.accept ?? "image/*"}
                      onChange={(e) => setFormFiles((v) => ({ ...v, [f.name]: e.target.files?.[0] ?? null }))}
                      className="w-full text-sm"
                    />
                  ) : f.type === "select" ? (
                    <select
                      required={f.required}
                      value={(formValues[f.name] as string | undefined) ?? ""}
                      onChange={(e) => setFormValues((v) => ({ ...v, [f.name]: e.target.value }))}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
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
                      value={(formValues[f.name] as string | number | undefined) ?? ""}
                      onChange={(e) => setFormValues((v) => ({ ...v, [f.name]: e.target.value }))}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                    />
                  )}
                </label>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
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
