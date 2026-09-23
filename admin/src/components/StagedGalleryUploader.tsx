import { useEffect, useMemo, useRef } from "react";

/**
 * Gallery picker for a tour that doesn't exist yet (the "Add Tour" form). Images
 * are held locally and previewed; the parent uploads them to `/admin/tour-media`
 * once the tour is created and it has an id. Reordering/lead-image come later,
 * from the server-backed manager on the edit form.
 */
export function StagedGalleryUploader({
  files,
  onChange,
}: {
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => {
    return () => previews.forEach((u) => URL.revokeObjectURL(u));
  }, [previews]);

  function add(list: FileList | null) {
    if (!list?.length) return;
    onChange([...files, ...Array.from(list)]);
  }

  return (
    <div className="mt-4 rounded-lg border border-neutral-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-700">Package images (gallery)</p>
          <p className="text-xs text-neutral-500">
            Add multiple images now — they're uploaded when you save the tour.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
        >
          Upload images
        </button>
      </div>

      {files.length === 0 ? (
        <p className="text-xs text-neutral-400">No images added yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {previews.map((url, i) => (
            <div
              key={i}
              className="relative aspect-square overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100"
            >
              <img src={url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => onChange(files.filter((_, idx) => idx !== i))}
                title="Remove"
                className="absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-sm font-bold text-white shadow hover:bg-red-700"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <p className="mt-2 text-xs text-neutral-400">
          {files.length} image{files.length !== 1 ? "s" : ""} ready · reorder after saving.
        </p>
      )}
    </div>
  );
}
