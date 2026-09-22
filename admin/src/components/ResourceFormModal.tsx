import type { UseMutationResult } from "@tanstack/react-query";

import { type FieldConfig } from "./resourceForm";
import { ImageCropModal } from "./ImageCropModal";

type Props<T> = {
  title: string; // singular label, e.g. "Tour Date" — used in headings/buttons
  fields: FieldConfig[];
  modalItem: T | null | undefined; // undefined = closed, null = create, T = edit
  formValues: Record<string, unknown>;
  setFormValues: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  formFiles: Record<string, File | null>;
  setFormFiles: React.Dispatch<React.SetStateAction<Record<string, File | null>>>;
  formError: string | null;
  cropTarget: { field: FieldConfig & { type: "file" }; file: File } | null;
  setCropTarget: (v: { field: FieldConfig & { type: "file" }; file: File } | null) => void;
  lightbox: string | null;
  setLightbox: (v: string | null) => void;
  filePreviews: Record<string, string>;
  closeModal: () => void;
  saveMutation: UseMutationResult<unknown, unknown, void, unknown>;
};

/**
 * The create/edit form modal (plus its image-crop and lightbox dialogs) shared
 * by ResourceCrudPage's flat tables and GroupedResourceCrudPage's per-tour
 * containers — one implementation of field rendering, file upload/crop and
 * save/cancel, so both stay in lockstep.
 */
export function ResourceFormModal<T extends { _id: string }>({
  title,
  fields,
  modalItem,
  formValues,
  setFormValues,
  formFiles,
  setFormFiles,
  formError,
  cropTarget,
  setCropTarget,
  lightbox,
  setLightbox,
  filePreviews,
  closeModal,
  saveMutation,
}: Props<T>) {
  return (
    <>
      {modalItem !== undefined && (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate();
            }}
            className="my-8 w-full max-w-md rounded-xl bg-white p-6 shadow-lg"
          >
            <h2 className="mb-4 text-base font-semibold text-slate-900">
              {modalItem ? `Edit ${title}` : `New ${title}`}
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
                    <span className="mb-1 block font-medium text-slate-700">{f.label}</span>
                    <input
                      type="file"
                      accept={f.accept ?? "image/*"}
                      onChange={(e) => {
                        const picked = e.target.files?.[0] ?? null;
                        e.target.value = ""; // allow re-selecting the same file
                        if (picked && f.crop) setCropTarget({ field: f, file: picked });
                        else setFormFiles((v) => ({ ...v, [f.name]: picked }));
                      }}
                      className="w-full text-sm text-slate-500 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-red-600 file:px-3 file:py-1 file:text-xs file:font-medium file:text-white hover:file:bg-red-700"
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
                            className="max-h-48 w-full cursor-zoom-in rounded-md border border-slate-200 bg-slate-50 object-contain"
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
                    <span className="mb-1 block font-medium text-slate-700">{f.label}</span>
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
                        className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-red-500"
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
                        className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-red-500"
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
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
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
    </>
  );
}
