import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { api, apiErrorMessage } from "../lib/api";

// One ranked Wikimedia candidate returned by the /suggest endpoint.
type Candidate = {
  fileTitle: string;
  imageUrl: string;
  thumbUrl: string;
  descriptionUrl: string;
  artist: string;
  licenseName: string;
  licenseUrl: string;
  attribution: string;
  width: number;
  height: number;
  score: number;
};

type Entry = {
  imageUrl: string;
  thumbUrl: string;
  attribution: string;
  artist: string;
  licenseName: string;
  licenseUrl: string;
  descriptionUrl: string;
  fileTitle: string;
  source: string;
  selectionMethod: "auto" | "manual";
  matchStatus: "published" | "needs_review" | "empty" | "failed";
  searchKeyword: string;
  score: number;
};

type DayItem = {
  key: string;
  dayNumber: number | null;
  title: string;
  description: string;
  entry: Entry | null;
};

/**
 * Per-day itinerary images (Wikimedia Commons). Shows each parsed day with its
 * resolved photo, a status badge (auto-published / needs review / manual), and
 * controls to search again, regenerate, or replace with a URL/upload. Only shown
 * when editing a saved tour — it reads the tour's *saved* itinerary text.
 *
 * The package gallery is untouched; this is a separate feature.
 */
export function ItineraryDayImagesManager({ tourId }: { tourId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["/admin/tours", tourId, "itinerary-images"];

  const { data: items, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () =>
      (await api.get(`/admin/tours/${tourId}/itinerary-images`)).data.items as DayItem[],
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  // Which day's suggestion gallery is open, plus its loaded candidates.
  const [suggestKey, setSuggestKey] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [suggestQuery, setSuggestQuery] = useState("");
  // Which day's manual-replace row is open.
  const [replaceKey, setReplaceKey] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const suggestMutation = useMutation({
    mutationFn: async (key: string) =>
      (await api.post(`/admin/tours/${tourId}/itinerary-images/suggest`, { key })).data as {
        query: string;
        candidates: Candidate[];
      },
    onSuccess: (data, key) => {
      setSuggestKey(key);
      setCandidates(data.candidates);
      setSuggestQuery(data.query);
    },
  });

  const selectMutation = useMutation({
    mutationFn: async (vars: { key: string; candidate: Candidate; query: string }) =>
      api.post(`/admin/tours/${tourId}/itinerary-images/select`, vars),
    onSuccess: () => {
      setSuggestKey(null);
      setCandidates([]);
      invalidate();
    },
  });

  const regenMutation = useMutation({
    mutationFn: async (key?: string) =>
      api.post(`/admin/tours/${tourId}/itinerary-images/regenerate`, key ? { key } : {}),
    onSuccess: invalidate,
  });

  const manualMutation = useMutation({
    mutationFn: async (vars: { key: string; url?: string; file?: File }) => {
      if (vars.file) {
        const body = new FormData();
        body.append("key", vars.key);
        body.append("image", vars.file);
        return api.post(`/admin/tours/${tourId}/itinerary-images/manual`, body);
      }
      return api.post(`/admin/tours/${tourId}/itinerary-images/manual`, {
        key: vars.key,
        imageUrl: vars.url,
      });
    },
    onSuccess: () => {
      setReplaceKey(null);
      setManualUrl("");
      invalidate();
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (key: string) => api.delete(`/admin/tours/${tourId}/itinerary-images/${key}`),
    onSuccess: invalidate,
  });

  const busy =
    suggestMutation.isPending ||
    selectMutation.isPending ||
    regenMutation.isPending ||
    manualMutation.isPending ||
    removeMutation.isPending;

  return (
    <div className="mt-4 rounded-lg border border-neutral-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-700">Itinerary day images</p>
          <p className="text-xs text-neutral-500">
            Auto-matched from each day's destination via Wikimedia Commons. Reads the{" "}
            <span className="font-medium">saved</span> itinerary — save the tour after editing days,
            then refresh here.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => regenMutation.mutate(undefined)}
          className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
          title="Fetch images for any days that don't have one yet (keeps manual picks)"
        >
          {regenMutation.isPending ? "Working…" : "Generate missing"}
        </button>
      </div>

      {(error ||
        regenMutation.error ||
        suggestMutation.error ||
        selectMutation.error ||
        manualMutation.error ||
        removeMutation.error) && (
        <p className="mb-2 text-xs text-red-600">
          {apiErrorMessage(
            error ??
              regenMutation.error ??
              suggestMutation.error ??
              selectMutation.error ??
              manualMutation.error ??
              removeMutation.error,
          )}
        </p>
      )}

      {isLoading ? (
        <p className="text-xs text-neutral-400">Loading days…</p>
      ) : !items || items.length === 0 ? (
        <p className="text-xs text-neutral-400">
          No itinerary days detected. Add days as "Day 1 – …", "Day 2 – …" in the Itinerary field and save.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.key} className="rounded-lg border border-neutral-200 p-2">
              <div className="flex gap-3">
                {/* Preview */}
                <div className="h-16 w-20 shrink-0 overflow-hidden rounded-md border border-neutral-200 bg-neutral-100">
                  {item.entry?.imageUrl ? (
                    <img src={item.entry.thumbUrl || item.entry.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-neutral-400">
                      No image
                    </div>
                  )}
                </div>

                {/* Info + controls */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-neutral-800">
                      {item.dayNumber != null ? `Day ${item.dayNumber}` : "Day"} — {item.title || "Untitled"}
                    </span>
                    <StatusBadge entry={item.entry} />
                  </div>
                  {item.entry?.attribution && (
                    <p className="mt-0.5 truncate text-[11px] text-neutral-500">
                      {item.entry.descriptionUrl ? (
                        <a href={item.entry.descriptionUrl} target="_blank" rel="noreferrer" className="hover:underline">
                          {item.entry.attribution}
                        </a>
                      ) : (
                        item.entry.attribution
                      )}
                    </p>
                  )}

                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => suggestMutation.mutate(item.key)}
                      className="rounded border border-neutral-300 px-2 py-0.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                    >
                      {suggestMutation.isPending && suggestMutation.variables === item.key ? "Searching…" : "Suggestions"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => regenMutation.mutate(item.key)}
                      className="rounded border border-neutral-300 px-2 py-0.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                      title="Auto-pick the best match again"
                    >
                      Regenerate
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setReplaceKey((k) => (k === item.key ? null : item.key));
                        setManualUrl("");
                      }}
                      className="rounded border border-neutral-300 px-2 py-0.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                    >
                      Replace
                    </button>
                    {item.entry?.imageUrl && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (confirm("Remove this day's image?")) removeMutation.mutate(item.key);
                        }}
                        className="rounded border border-neutral-300 px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                        title="Clear this image (the day can be regenerated afterwards)"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  {/* Manual replace row */}
                  {replaceKey === item.key && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-neutral-50 p-2">
                      <div className="w-full">
                        <input
                          type="url"
                          placeholder="Paste a direct image link (ends in .jpg/.png)"
                          value={manualUrl}
                          onChange={(e) => setManualUrl(e.target.value)}
                          className="w-full rounded border border-neutral-300 px-2 py-1 text-xs"
                        />
                        <p className="mt-1 text-[10px] text-neutral-400">
                          Must link straight to an image file. A Google Maps or web-page link won't load —
                          open the photo, then “Copy image address”.
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={busy || !manualUrl.trim()}
                        onClick={() => manualMutation.mutate({ key: item.key, url: manualUrl.trim() })}
                        className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        Use URL
                      </button>
                      <span className="text-[11px] text-neutral-400">or</span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) manualMutation.mutate({ key: item.key, file: f });
                        }}
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => fileInputRef.current?.click()}
                        className="rounded border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                      >
                        Upload
                      </button>
                    </div>
                  )}

                  {/* Suggestions gallery */}
                  {suggestKey === item.key && (
                    <div className="mt-2 rounded-md bg-neutral-50 p-2">
                      <p className="mb-1.5 text-[11px] text-neutral-500">
                        Results for “{suggestQuery}” — click to use:
                      </p>
                      {candidates.length === 0 ? (
                        <p className="text-xs text-neutral-400">No suitable images found. Try editing the day title.</p>
                      ) : (
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                          {candidates.map((c) => (
                            <button
                              key={c.fileTitle}
                              type="button"
                              disabled={busy}
                              onClick={() => selectMutation.mutate({ key: item.key, candidate: c, query: suggestQuery })}
                              title={`${c.attribution} · score ${c.score.toFixed(0)}`}
                              className="group relative aspect-square overflow-hidden rounded border border-neutral-200 hover:ring-2 hover:ring-red-500 disabled:opacity-50"
                            >
                              <img src={c.thumbUrl} alt="" className="h-full w-full object-cover" />
                              <span className="absolute bottom-0 left-0 right-0 truncate bg-black/50 px-1 py-0.5 text-[9px] text-white">
                                {c.licenseName || "Commons"}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ entry }: { entry: Entry | null }) {
  if (!entry || entry.matchStatus === "empty") {
    return <Badge className="bg-neutral-100 text-neutral-500">No image</Badge>;
  }
  if (entry.selectionMethod === "manual") {
    return <Badge className="bg-blue-100 text-blue-700">Manual</Badge>;
  }
  if (entry.matchStatus === "published") {
    return <Badge className="bg-green-100 text-green-700">Auto</Badge>;
  }
  if (entry.matchStatus === "needs_review") {
    return <Badge className="bg-amber-100 text-amber-700">Needs review</Badge>;
  }
  return <Badge className="bg-neutral-100 text-neutral-500">Not found</Badge>;
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${className}`}>{children}</span>
  );
}
