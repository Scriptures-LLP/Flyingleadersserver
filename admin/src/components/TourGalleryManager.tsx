import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";

import { api, apiErrorMessage } from "../lib/api";

type TourMediaItem = {
  _id: string;
  file: string;
  url: string;
  title?: string;
  alt?: string;
  isPrimary: boolean;
  sortOrder: number;
};

/**
 * Per-tour package gallery: upload multiple images, reorder them, mark one as
 * the lead ("primary"), and delete. Backed by the `/admin/tour-media` API.
 * Only shown when editing an existing tour — uploads need a tourId to attach to.
 */
export function TourGalleryManager({ tourId }: { tourId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["/admin/tour-media", tourId];
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: items, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () =>
      (await api.get("/admin/tour-media", { params: { tourId } })).data.items as TourMediaItem[],
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const uploadMutation = useMutation({
    mutationFn: async (files: FileList) => {
      const body = new FormData();
      body.append("tourId", tourId);
      Array.from(files).forEach((f) => body.append("files", f));
      return api.post("/admin/tour-media", body, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/admin/tour-media/${id}`),
    onSuccess: invalidate,
  });

  const primaryMutation = useMutation({
    mutationFn: async (id: string) => api.put(`/admin/tour-media/${id}`, { isPrimary: true }),
    onSuccess: invalidate,
  });

  const reorderMutation = useMutation({
    mutationFn: async (ids: string[]) => api.put("/admin/tour-media/reorder", { ids }),
    onSuccess: invalidate,
  });

  // Persist a new order after moving an image one slot left/right.
  function move(index: number, delta: number) {
    if (!items) return;
    const next = [...items];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    reorderMutation.mutate(next.map((m) => m._id));
  }

  const busy =
    uploadMutation.isPending ||
    deleteMutation.isPending ||
    primaryMutation.isPending ||
    reorderMutation.isPending;

  return (
    <div className="mt-4 rounded-lg border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-700">Package images (gallery)</p>
          <p className="text-xs text-slate-500">
            Shown as thumbnails on the package details screen. Drag order is set with the arrows.
          </p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) uploadMutation.mutate(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {uploadMutation.isPending ? "Uploading…" : "+ Add images"}
          </button>
        </div>
      </div>

      {(error || uploadMutation.error || reorderMutation.error) && (
        <p className="mb-2 text-xs text-red-600">
          {apiErrorMessage(error ?? uploadMutation.error ?? reorderMutation.error)}
        </p>
      )}

      {isLoading ? (
        <p className="text-xs text-slate-400">Loading images…</p>
      ) : !items || items.length === 0 ? (
        <p className="text-xs text-slate-400">No images yet. Add a few to build the gallery.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {items.map((item, i) => (
            <div
              key={item._id}
              className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
            >
              <img src={item.url} alt={item.alt ?? ""} className="h-full w-full object-cover" />

              {item.isPrimary && (
                <span className="absolute left-1 top-1 rounded bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  Primary
                </span>
              )}

              {/* Always-visible delete cross */}
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (confirm("Remove this image?")) deleteMutation.mutate(item._id);
                }}
                className="absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-sm font-bold text-white shadow hover:bg-red-700 disabled:opacity-50"
                title="Remove"
              >
                ×
              </button>

              {/* Reorder / lead controls on hover */}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/40 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    disabled={busy || i === 0}
                    onClick={() => move(i, -1)}
                    className="rounded bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40"
                    title="Move left"
                  >
                    ←
                  </button>
                  {!item.isPrimary && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => primaryMutation.mutate(item._id)}
                      className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-red-700"
                      title="Make this the lead image"
                    >
                      Set lead
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy || i === items.length - 1}
                    onClick={() => move(i, 1)}
                    className="rounded bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40"
                    title="Move right"
                  >
                    →
                  </button>
                </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
