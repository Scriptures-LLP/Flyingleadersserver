import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { api, apiErrorMessage } from "../lib/api";

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["/admin/settings/terms_html"],
    queryFn: async () => (await api.get("/admin/settings/terms_html")).data.item as { key: string; value: string },
  });

  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setValue(data.value);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => api.put("/admin/settings/terms_html", { value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/admin/settings/terms_html"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-slate-900">Terms & Conditions</h1>
      <p className="mb-3 text-sm text-slate-500">
        Raw HTML shown on the public terms page. Edited here, takes effect immediately.
      </p>

      {isLoading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          {saveMutation.isError && (
            <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {apiErrorMessage(saveMutation.error)}
            </div>
          )}
          <textarea
            className="w-full rounded-md border border-slate-300 p-3 font-mono text-sm outline-none focus:border-slate-500"
            rows={16}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saveMutation.isPending ? "Saving…" : "Save"}
            </button>
            {saved && <span className="text-sm text-emerald-600">Saved</span>}
          </div>
        </div>
      )}
    </div>
  );
}
