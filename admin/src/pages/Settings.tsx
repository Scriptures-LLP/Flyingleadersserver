import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { RichTextEditor } from "../components/RichTextEditor";
import { api, apiErrorMessage } from "../lib/api";

function useSetting(key: string) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["/admin/settings", key],
    queryFn: async () => (await api.get(`/admin/settings/${key}`)).data.item as { key: string; value: string },
  });

  const saveMutation = useMutation({
    mutationFn: async (value: string) => api.put(`/admin/settings/${key}`, { value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/admin/settings", key] }),
  });

  return { data, isLoading, saveMutation };
}

function ReferralRewardSetting() {
  const { data, isLoading, saveMutation } = useSetting("referral_reward_amount");
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setValue(data.value || "500");
  }, [data]);

  return (
    <div className="mt-6">
      <h2 className="mb-1 text-base font-semibold text-slate-900">Referral Reward</h2>
      <p className="mb-3 text-sm text-slate-500">
        Wallet credit given to a customer when someone they referred completes their first payment.
      </p>
      {isLoading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <span className="text-sm text-slate-600">₹</span>
          <input
            type="number"
            min="0"
            className="input max-w-[140px]"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button
            onClick={() =>
              saveMutation.mutate(value, {
                onSuccess: () => {
                  setSaved(true);
                  setTimeout(() => setSaved(false), 2000);
                },
              })
            }
            disabled={saveMutation.isPending}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saveMutation.isPending ? "Saving…" : "Save"}
          </button>
          {saved && <span className="text-sm text-emerald-600">Saved</span>}
        </div>
      )}
    </div>
  );
}

function AgeCategorySettings() {
  const infant = useSetting("age_category_infant_max_age");
  const child = useSetting("age_category_child_max_age");
  const [infantValue, setInfantValue] = useState("");
  const [childValue, setChildValue] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (infant.data) setInfantValue(infant.data.value || "2");
  }, [infant.data]);
  useEffect(() => {
    if (child.data) setChildValue(child.data.value || "11");
  }, [child.data]);

  const saving = infant.saveMutation.isPending || child.saveMutation.isPending;

  const onSave = () => {
    infant.saveMutation.mutate(infantValue);
    child.saveMutation.mutate(childValue, {
      onSuccess: () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      },
    });
  };

  return (
    <div className="mt-6">
      <h2 className="mb-1 text-base font-semibold text-slate-900">Age Categories</h2>
      <p className="mb-3 text-sm text-slate-500">
        Determines Adult/Child/Infant purely from age — used consistently for pricing, the payment summary, and
        invoices, so a traveller can never be priced as one category while shown as another.
      </p>
      {infant.isLoading || child.isLoading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <div className="flex flex-wrap items-end gap-4 rounded-lg border border-slate-200 bg-white p-4">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Infant: age 0 to</span>
            <input
              type="number"
              min="0"
              className="input max-w-[100px]"
              value={infantValue}
              onChange={(e) => setInfantValue(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">Child: age (infant max + 1) to</span>
            <input
              type="number"
              min="0"
              className="input max-w-[100px]"
              value={childValue}
              onChange={(e) => setChildValue(e.target.value)}
            />
          </label>
          <p className="text-sm text-slate-500">Adult: anything older</p>
          <button
            onClick={onSave}
            disabled={saving}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {saved && <span className="text-sm text-emerald-600">Saved</span>}
        </div>
      )}
    </div>
  );
}

export function SettingsPage() {
  const { data, isLoading, saveMutation } = useSetting("terms_html");

  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setValue(data.value);
  }, [data]);

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-slate-900">Terms & Conditions</h1>
      <p className="mb-3 text-sm text-slate-500">
        Shown on the public terms page. Formatted here — no HTML tags to write or read.
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
          <RichTextEditor value={value} onChange={setValue} />
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={() =>
                saveMutation.mutate(value, {
                  onSuccess: () => {
                    setSaved(true);
                    setTimeout(() => setSaved(false), 2000);
                  },
                })
              }
              disabled={saveMutation.isPending}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saveMutation.isPending ? "Saving…" : "Save"}
            </button>
            {saved && <span className="text-sm text-emerald-600">Saved</span>}
          </div>
        </div>
      )}

      <ReferralRewardSetting />
      <AgeCategorySettings />
    </div>
  );
}
