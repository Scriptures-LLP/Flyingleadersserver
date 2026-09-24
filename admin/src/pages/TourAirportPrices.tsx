import { useQuery } from "@tanstack/react-query";

import { ChargeCell } from "../components/ChargeCell";
import { GroupedResourceCrudPage } from "../components/GroupedResourceCrudPage";
import { StatusBadge } from "../components/StatusBadge";
import { api } from "../lib/api";

type TourAirportPrice = {
  _id: string;
  tourId: string;
  airportId: string;
  addonPrice: number;
  appliesToAdult: boolean;
  appliesToChild: boolean;
  appliesToInfant: boolean;
  isActive: boolean;
};
type Airport = { _id: string; code: string; name: string };

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
      rowColumns={["Departure Airport", "Airport Charge", "Status"]}
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
                <span className="inline-flex items-center gap-1.5 rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
                  <span className="font-semibold">{a.code}</span>
                  <span className="text-neutral-500">{a.name}</span>
                </span>
              ) : (
                <span className="text-xs italic text-neutral-400">…</span>
              )}
            </td>
            <td className="px-4 py-2">
              <ChargeCell
                amount={r.addonPrice}
                adult={r.appliesToAdult}
                child={r.appliesToChild}
                infant={r.appliesToInfant}
              />
            </td>
            <td className="px-4 py-2">
              <StatusBadge active={r.isActive} />
            </td>
            <td className="px-4 py-2 text-right">
              <button onClick={onEdit} className="mr-3 text-neutral-600 hover:underline">
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
        {
          name: "addonPrice",
          label: "Airport charge (₹) — added automatically to the prices ticked below; leave blank for none",
          type: "number",
        },
        { name: "appliesToAdult", label: "Add to the Adult price", type: "checkbox" },
        { name: "appliesToChild", label: "Add to the Child price", type: "checkbox" },
        { name: "appliesToInfant", label: "Add to the Infant price", type: "checkbox" },
        { name: "isActive", label: "Active", type: "checkbox" },
      ]}
    />
  );
}
