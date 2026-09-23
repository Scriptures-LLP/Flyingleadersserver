import { useQuery } from "@tanstack/react-query";

import { ResourceCrudPage } from "../components/ResourceCrudPage";
import { StatusBadge } from "../components/StatusBadge";
import { api } from "../lib/api";

type PromoCode = {
  _id: string;
  code: string;
  tourId?: string | null;
  type: "percent" | "amount";
  value: number;
  maxDiscount?: number;
  minCart?: number;
  usageLimit?: number;
  perUserLimit?: number;
  startsAt?: string;
  expiresAt?: string;
  isActive: boolean;
  note?: string;
};

type Tour = { _id: string; title: string };

export function PromoCodesPage() {
  const { data: tours } = useQuery({
    queryKey: ["/admin/tours"],
    queryFn: async () => (await api.get("/admin/tours")).data.items as Tour[],
  });

  return (
    <ResourceCrudPage<PromoCode>
      title="Promo Codes"
      resourcePath="/admin/promo-codes"
      columns={[
        { key: "code", label: "Code" },
        { key: "type", label: "Type" },
        { key: "value", label: "Value" },
        { key: "tourId", label: "Scope", render: (p) => (p.tourId ? tours?.find((t) => t._id === p.tourId)?.title ?? "…" : "All tours") },
        {
          key: "startsAt",
          label: "Valid",
          render: (p) =>
            p.startsAt || p.expiresAt
              ? `${p.startsAt ? new Date(p.startsAt).toLocaleString("en-IN") : "any time"} → ${p.expiresAt ? new Date(p.expiresAt).toLocaleString("en-IN") : "no end"}`
              : "Always",
        },
        { key: "isActive", label: "Active", render: (p) => <StatusBadge active={p.isActive} /> },
      ]}
      fields={[
        { name: "code", label: "Code", type: "text", required: true },
        {
          name: "type",
          label: "Discount type",
          type: "select",
          required: true,
          allowBlank: false,
          options: [
            { value: "percent", label: "Percent (%)" },
            { value: "amount", label: "Flat amount (₹)" },
          ],
        },
        { name: "value", label: "Value", type: "number", required: true },
        { name: "maxDiscount", label: "Max discount (₹, for percent type)", type: "number" },
        { name: "minCart", label: "Minimum booking amount (₹)", type: "number" },
        { name: "usageLimit", label: "Total usage limit", type: "number" },
        { name: "perUserLimit", label: "Per-customer usage limit", type: "number" },
        { name: "startsAt", label: "Start date & time (leave blank for no start restriction)", type: "datetime-local" },
        { name: "expiresAt", label: "End date & time (leave blank for no expiry)", type: "datetime-local" },
        {
          name: "tourId",
          label: "Applies to",
          type: "select",
          options: (tours ?? []).map((t) => ({ value: t._id, label: t.title })),
        },
        { name: "note", label: "Internal note", type: "text" },
        { name: "isActive", label: "Active", type: "checkbox" },
      ]}
    />
  );
}
