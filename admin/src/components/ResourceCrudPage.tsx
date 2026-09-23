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
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="h-6 w-1.5 rounded-full bg-gradient-to-b from-red-500 to-red-600" />
            <h1 className="text-xl font-bold tracking-tight text-neutral-900">{title}</h1>
            {data && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                {data.length}
              </span>
            )}
          </div>
          {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
        </div>
        <button
          onClick={() => openCreate()}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
        >
          Add {singular}
        </button>
      </div>

      {isLoading && <p className="text-neutral-500">Loading…</p>}
      {error && <p className="text-red-600">{apiErrorMessage(error)}</p>}

      {data && (
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
              {data.map((item) => (
                <tr key={item._id} className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-neutral-50/70">
                  {columns.map((c) => (
                    <td key={c.key} className="px-4 py-2 text-neutral-700">
                      {c.render ? c.render(item) : String((item as Record<string, unknown>)[c.key] ?? "")}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => openEdit(item)} className="mr-3 text-neutral-600 hover:underline">
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
                  <td colSpan={columns.length + 1} className="px-4 py-6 text-center text-neutral-400">
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
