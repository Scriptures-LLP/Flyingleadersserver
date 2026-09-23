import { useQuery } from "@tanstack/react-query";

import { GroupedResourceCrudPage } from "../components/GroupedResourceCrudPage";
import { api } from "../lib/api";

type TourAirportPrice = { _id: string; tourId: string; airportId: string; addonPrice: number; isActive: boolean };
type Airport = { _id: string; code: string; name: string };

const badge = (ok: boolean) => (
  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ok ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>
    {ok ? "Active" : "Inactive"}
  </span>
);

export function TourAirportPricesPage() {
  const { data: tours } = useQuery({
    queryKey: ["/admin/tours"],
    queryFn: async () => (await api.get("/admin/tours")).data.items as { _id: string; title: string }[],
  });
  const { data: airports } = useQuery({
    queryKey: ["/admin/airports"],
    queryFn: async () => (await api.get("/admin/airports")).data.items as Airport[],
  });

  const airport = (id: string) => airports?.find((a) => a._id === id);

  return (
    <GroupedResourceCrudPage<TourAirportPrice>
      title="Tour Airport Prices"
      resourcePath="/admin/tour-airport-prices"
      tourField="tourId"
      rowColumns={["Departure Airport", "Add-on Price", "Status"]}
      emptyRowLabel="No airport prices for this tour yet — click “Add here” to create one."
      // Alphabetical by airport, so the rates for every departure airport on a
      // tour are easy to scan and compare at a glance.
      sortRows={(a, b) => (airport(a.airportId)?.code ?? "").localeCompare(airport(b.airportId)?.code ?? "")}
      renderRow={(r, { onEdit, onDelete }) => {
        const a = airport(r.airportId);
        return (
          <>
            <td className="px-4 py-2">
              {a ? (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                  <span className="font-semibold">{a.code}</span>
                  <span className="text-slate-500">{a.name}</span>
                </span>
              ) : (
                <span className="text-xs italic text-slate-400">…</span>
              )}
            </td>
            <td className="px-4 py-2">
              {r.addonPrice ? (
                <span className="font-semibold text-slate-800">₹{r.addonPrice}</span>
              ) : (
                <span className="text-xs text-slate-400">— free</span>
              )}
            </td>
            <td className="px-4 py-2">{badge(r.isActive)}</td>
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
          label: "Airport",
          type: "select",
          required: true,
          allowBlank: false,
          options: (airports ?? []).map((a) => ({ value: a._id, label: `${a.code} — ${a.name}` })),
        },
        { name: "addonPrice", label: "Add-on price (₹, on top of tour base price — leave blank for none)", type: "number" },
        { name: "isActive", label: "Active", type: "checkbox" },
      ]}
    />
  );
}
