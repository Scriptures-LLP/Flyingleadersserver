import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { RichTextEditor } from "../components/RichTextEditor";
import { api, apiErrorMessage } from "../lib/api";
import { cleanSocialUrl, SOCIAL_PLATFORMS, type SocialKey } from "../lib/socialLinks";

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
      <h2 className="mb-1 text-base font-semibold text-neutral-900">Referral Reward</h2>
      <p className="mb-3 text-sm text-neutral-500">
        Wallet credit given to a customer when someone they referred completes their first payment.
      </p>
      {isLoading ? (
        <p className="text-neutral-500">Loading…</p>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white shadow-sm p-4">
          <span className="text-sm text-neutral-600">₹</span>
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
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {saveMutation.isPending ? "Saving…" : "Save"}
          </button>
          {saved && <span className="text-sm text-neutral-600">Saved</span>}
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
      <h2 className="mb-1 text-base font-semibold text-neutral-900">Age Categories</h2>
      <p className="mb-3 text-sm text-neutral-500">
        Determines Adult/Child/Infant purely from age — used consistently for pricing, the payment summary, and
        invoices, so a traveller can never be priced as one category while shown as another.
      </p>
      {infant.isLoading || child.isLoading ? (
        <p className="text-neutral-500">Loading…</p>
      ) : (
        <div className="flex flex-wrap items-end gap-4 rounded-xl border border-neutral-200 bg-white shadow-sm p-4">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-neutral-700">Infant: age 0 to</span>
            <input
              type="number"
              min="0"
              className="input max-w-[100px]"
              value={infantValue}
              onChange={(e) => setInfantValue(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-neutral-700">Child: age (infant max + 1) to</span>
            <input
              type="number"
              min="0"
              className="input max-w-[100px]"
              value={childValue}
              onChange={(e) => setChildValue(e.target.value)}
            />
          </label>
          <p className="text-sm text-neutral-500">Adult: anything older</p>
          <button
            onClick={onSave}
            disabled={saving}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {saved && <span className="text-sm text-neutral-600">Saved</span>}
        </div>
      )}
    </div>
  );
}

function SocialLinksSettings() {
  const queryClient = useQueryClient();
  const keys = SOCIAL_PLATFORMS.map((p) => `social_${p.key}`);
  const { data, isLoading } = useQuery({
    queryKey: ["/admin/settings", "social"],
    queryFn: async () => {
      const rows = await Promise.all(keys.map(async (k) => (await api.get(`/admin/settings/${k}`)).data.item as { key: string; value: string }));
      return Object.fromEntries(rows.map((r) => [r.key.replace("social_", ""), r.value])) as Record<SocialKey, string>;
    },
  });

  const [values, setValues] = useState<Record<SocialKey, string>>({ instagram: "", facebook: "", youtube: "", linkedin: "" });
  const [errors, setErrors] = useState<Partial<Record<SocialKey, string>>>({});
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (data) setValues({ instagram: data.instagram ?? "", facebook: data.facebook ?? "", youtube: data.youtube ?? "", linkedin: data.linkedin ?? "" });
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (cleaned: Record<SocialKey, string>) =>
      Promise.all(SOCIAL_PLATFORMS.map((p) => api.put(`/admin/settings/social_${p.key}`, { value: cleaned[p.key] }))),
    onSuccess: (_r, cleaned) => {
      setValues(cleaned);
      queryClient.invalidateQueries({ queryKey: ["/admin/settings", "social"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const save = () => {
    const nextErrors: Partial<Record<SocialKey, string>> = {};
    const cleaned = {} as Record<SocialKey, string>;
    for (const p of SOCIAL_PLATFORMS) {
      const raw = values[p.key].trim();
      const url = cleanSocialUrl(p.key, raw);
      if (raw && !url) nextErrors[p.key] = `That doesn't look like a ${p.label} link (expected ${p.hosts[0]}).`;
      cleaned[p.key] = url ?? "";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) saveMutation.mutate(cleaned);
  };

  return (
    <div className="mt-6">
      <h2 className="mb-1 text-base font-semibold text-neutral-900">Social media links</h2>
      <p className="mb-3 text-sm text-neutral-500">
        Shown as the "Connect With Us" icons at the bottom of the app's Home screen. Paste each official page link — changes appear in
        the app straight away, no new app version needed. Leave one empty to hide that icon; with all four empty the section is hidden.
      </p>
      {isLoading ? (
        <p className="text-neutral-500">Loading…</p>
      ) : (
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          {saveMutation.isError && (
            <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{apiErrorMessage(saveMutation.error)}</div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {SOCIAL_PLATFORMS.map((p) => (
              <label key={p.key} className="text-sm text-neutral-700">
                {p.label}
                <input
                  className="input mt-1"
                  inputMode="url"
                  placeholder={p.placeholder}
                  value={values[p.key]}
                  onChange={(e) => {
                    setValues((v) => ({ ...v, [p.key]: e.target.value }));
                    setErrors((er) => ({ ...er, [p.key]: undefined }));
                  }}
                />
                {errors[p.key] && <span className="mt-1 block text-xs text-red-600">{errors[p.key]}</span>}
              </label>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={save}
              disabled={saveMutation.isPending}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {saveMutation.isPending ? "Saving…" : "Save"}
            </button>
            {saved && <span className="text-sm text-neutral-600">Saved</span>}
          </div>
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
      <div className="mb-5 flex items-center gap-2.5">
        <span className="h-6 w-1.5 rounded-full bg-gradient-to-b from-red-500 to-red-600" />
        <h1 className="text-xl font-bold tracking-tight text-neutral-900">Terms &amp; Conditions</h1>
      </div>
      <p className="mb-3 text-sm text-neutral-500">
        Shown on the public terms page. Formatted here — no HTML tags to write or read.
      </p>

      {isLoading ? (
        <p className="text-neutral-500">Loading…</p>
      ) : (
        <div className="rounded-xl border border-neutral-200 bg-white shadow-sm p-4">
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
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {saveMutation.isPending ? "Saving…" : "Save"}
            </button>
            {saved && <span className="text-sm text-neutral-600">Saved</span>}
          </div>
        </div>
      )}

      <ReferralRewardSetting />
      <AgeCategorySettings />
      <SocialLinksSettings />
    </div>
  );
}
