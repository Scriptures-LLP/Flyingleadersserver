import { ResourceFormModal } from "./ResourceFormModal";
import { apiErrorMessage } from "../lib/api";
import { useResourceForm, type FieldConfig } from "./resourceForm";

export type { FieldConfig };

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
};

export function ResourceCrudPage<T extends { _id: string; isActive?: boolean }>({
  title,
  subtitle,
  resourcePath,
  columns,
  fields,
}: Props<T>) {
  const form = useResourceForm<T>(resourcePath, fields);
  const { data, isLoading, error, modalItem, openCreate, openEdit, deleteMutation } = form;
  const singular = title.replace(/s$/, "");

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        <button
          onClick={() => openCreate()}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
        >
          Add {singular}
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
                        if (confirm(`Delete this ${singular.toLowerCase()}?`)) {
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

      <ResourceFormModal<T> title={singular} fields={fields} closeModal={form.closeModal} {...pick(form, modalItem)} />
    </div>
  );
}

// Narrows the hook's return down to exactly what the shared modal needs,
// keeping this file's own props list free of modal internals it never reads.
function pick<T extends { _id: string }>(form: ReturnType<typeof useResourceForm<T>>, modalItem: T | null | undefined) {
  return {
    modalItem,
    formValues: form.formValues,
    setFormValues: form.setFormValues,
    formFiles: form.formFiles,
    setFormFiles: form.setFormFiles,
    formError: form.formError,
    cropTarget: form.cropTarget,
    setCropTarget: form.setCropTarget,
    lightbox: form.lightbox,
    setLightbox: form.setLightbox,
    filePreviews: form.filePreviews,
    saveMutation: form.saveMutation,
  };
}
