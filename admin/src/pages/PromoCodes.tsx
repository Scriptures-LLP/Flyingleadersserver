import { useQuery } from "@tanstack/react-query";

import { ResourceCrudPage } from "../components/ResourceCrudPage";
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
  // Computed by the server: paid/partly-paid uses, and unpaid bookings that
  // are currently holding a use.
  usedCount?: number;
  heldCount?: number;
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
        {
          key: "usedCount",
          label: "Used",
          render: (p) => {
            const held = p.heldCount ? ` (+${p.heldCount} reserved)` : "";
            return `${p.usedCount ?? 0}${p.usageLimit ? ` / ${p.usageLimit}` : ""}${held}`;
          },
        },
        {
          key: "perUserLimit",
          label: "Per customer",
          render: (p) => (p.perUserLimit ? `${p.perUserLimit} time${p.perUserLimit > 1 ? "s" : ""}` : "Unlimited"),
        },
        { key: "isActive", label: "Active", render: (p) => (p.isActive ? "Yes" : "No") },
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
        {
          name: "usageLimit",
          label: "Total usage limit — how many bookings in total can use this code (0 or blank = unlimited)",
          type: "number",
          blankAs: 0,
        },
        {
          name: "perUserLimit",
          label: "Customer usage limit — how many times one customer can use it (0 or blank = unlimited)",
          type: "number",
          blankAs: 0,
        },
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
