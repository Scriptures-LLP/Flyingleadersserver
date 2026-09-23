import { useQuery } from "@tanstack/react-query";

import { GroupedResourceCrudPage } from "../components/GroupedResourceCrudPage";
import { api } from "../lib/api";

type TourDate = {
  _id: string;
  tourId: string;
  airportId?: string | null;
  date: string;
  price: number;
  appliesToAdult: boolean;
  appliesToChild: boolean;
  appliesToInfant: boolean;
  label?: string;
  isActive: boolean;
};

type Airport = { _id: string; code: string; name: string };

const badge = (ok: boolean) => (
  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ok ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>
    {ok ? "Active" : "Inactive"}
  </span>
);

export function TourDatesPage() {
  const { data: tours } = useQuery({
    queryKey: ["/admin/tours"],
    queryFn: async () => (await api.get("/admin/tours")).data.items as { _id: string; title: string }[],
  });
  const { data: airports } = useQuery({
    queryKey: ["/admin/airports"],
    queryFn: async () => (await api.get("/admin/airports")).data.items as Airport[],
  });

  const airport = (id?: string | null) => (id ? airports?.find((a) => a._id === id) : null);
  const isPast = (iso: string) => new Date(iso).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0);

  return (
    <GroupedResourceCrudPage<TourDate>
      title="Tour Dates"
      resourcePath="/admin/tour-dates"
      tourField="tourId"
      rowColumns={["Date", "Departure Airport", "Add-on Price", "Status"]}
      emptyRowLabel="No dates for this tour yet — click “Add here” to create one."
      sortRows={(a, b) => {
        const byDate = a.date.localeCompare(b.date);
        if (byDate !== 0) return byDate;
        return (airport(a.airportId)?.code ?? "").localeCompare(airport(b.airportId)?.code ?? "");
      }}
      renderRow={(d, { onEdit, onDelete }) => {
        const a = airport(d.airportId);
        const past = isPast(d.date);
        return (
          <>
            <td className={`px-4 py-2 ${past ? "text-slate-400" : "text-slate-800"}`}>
              <span className="font-medium">{new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
              {past && <span className="ml-2 text-xs text-slate-400">(past)</span>}
              {d.label && <div className="text-xs text-slate-500">{d.label}</div>}
            </td>
            <td className="px-4 py-2">
              {a ? (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                  <span className="font-semibold">{a.code}</span>
                  <span className="text-slate-500">{a.name}</span>
                </span>
              ) : (
                <span className="text-xs italic text-slate-400">Any airport</span>
              )}
            </td>
            <td className="px-4 py-2">
              {d.price ? (
                <div>
                  <span className="font-semibold text-slate-800">₹{d.price}</span>
                  <div className="text-xs text-slate-500">
                    {[d.appliesToAdult && "Adult", d.appliesToChild && "Child", d.appliesToInfant && "Infant"].filter(Boolean).join(", ")}
                  </div>
                </div>
              ) : (
                <span className="text-xs text-slate-400">— free, all types</span>
              )}
            </td>
            <td className="px-4 py-2">{badge(d.isActive)}</td>
            <td className="px-4 py-2 text-right">
              <button onClick={onEdit} className="mr-3 text-slate-600 hover:underline">
                Edit
              </button>
              <button onClick={onDelete} className="text-red-600 hover:underline">
                Delete
              </button>
            </td>
          </>
        );
      }}
      fields={[
        {
          name: "tourId",
          label: "Tour",
          type: "select",
          required: true,
          allowBlank: false,
          options: (tours ?? []).map((t) => ({ value: t._id, label: t.title })),
        },
        {
          name: "airportId",
          label: "Airport (leave blank for any)",
          type: "select",
          options: (airports ?? []).map((a) => ({ value: a._id, label: `${a.code} — ${a.name}` })),
        },
        { name: "date", label: "Date", type: "date", required: true },
        {
          name: "price",
          label: "Add-on price (₹, on top of tour base price — leave blank for none)",
          type: "number",
        },
        { name: "appliesToAdult", label: "Price applies to Adult", type: "checkbox" },
        { name: "appliesToChild", label: "Price applies to Child", type: "checkbox" },
        { name: "appliesToInfant", label: "Price applies to Infant", type: "checkbox" },
        { name: "label", label: "Label (optional)", type: "text" },
        { name: "isActive", label: "Active", type: "checkbox" },
      ]}
    />
  );
}
