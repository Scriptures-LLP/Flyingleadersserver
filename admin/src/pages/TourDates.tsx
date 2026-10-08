import { useQuery } from "@tanstack/react-query";

import { ChargeCell } from "../components/ChargeCell";
import { GroupedResourceCrudPage } from "../components/GroupedResourceCrudPage";
import { StatusBadge } from "../components/StatusBadge";
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

type Airport = { _id: string; code: string; name: string; isActive: boolean };

export function TourDatesPage() {
  const { data: tours } = useQuery({
    queryKey: ["/admin/tours"],
    queryFn: async () => (await api.get("/admin/tours")).data.items as { _id: string; title: string }[],
  });
  const { data: airports } = useQuery({
    queryKey: ["/admin/airports"],
    queryFn: async () => (await api.get("/admin/airports")).data.items as Airport[],
  });
  const { data: airportPrices } = useQuery({
    queryKey: ["/admin/tour-airport-prices"],
    queryFn: async () =>
      (await api.get("/admin/tour-airport-prices")).data.items as { tourId: string; isActive: boolean }[],
  });
  // "Any airport" only actually means something once the tour has at least one
  // real, active departure airport to fly from — a tour with none configured
  // can't be booked from anywhere, no matter what its dates say (the booking
  // API itself now refuses it), so that date needs calling out rather than
  // looking like a normal, working setup.
  const toursWithAirports = new Set((airportPrices ?? []).filter((p) => p.isActive).map((p) => p.tourId));


  // Inactive airports still show here — sorted after the active ones and
  // clearly labelled — so deactivating an airport is visibly reflected the
  // moment an admin opens this dropdown, instead of it silently still
  // looking like a normal, live option. They're greyed out and unpickable
  // (disabled) rather than removed: a row that already references one keeps
  // showing it as its current value, it just can't be newly selected again
  // until it's made active.
  const airportOptions = (airports ?? [])
    .slice()
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.code.localeCompare(b.code))
    .map((a) => ({ value: a._id, label: `${a.code} — ${a.name}${a.isActive ? "" : " (Inactive)"}`, disabled: !a.isActive }));

  const airport = (id?: string | null) => (id ? airports?.find((a) => a._id === id) : null);
  const isPast = (iso: string) => new Date(iso).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0);

  return (
    <GroupedResourceCrudPage<TourDate>
      title="Tour Dates"
      resourcePath="/admin/tour-dates"
      tourField="tourId"
      rowColumns={["Date", "Departure Airport", "Travel Charge", "Status"]}
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
            <td className={`px-4 py-2 ${past ? "text-neutral-400" : "text-neutral-800"}`}>
              <span className="font-medium">{new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
              {past && <span className="ml-2 text-xs text-neutral-400">(past)</span>}
              {d.label && <div className="text-xs text-neutral-500">{d.label}</div>}
            </td>
            <td className="px-4 py-2">
              {a ? (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
                  <span className="font-semibold">{a.code}</span>
                  <span className="text-neutral-500">{a.name}</span>
                </span>
              ) : toursWithAirports.has(d.tourId) ? (
                <span className="text-xs italic text-neutral-400">Any airport</span>
              ) : (
                <span
                  className="text-xs font-medium text-amber-600"
                  title="This tour has no active departure airports configured (see Tour Airport Prices) — this date can't actually be booked from anywhere yet."
                >
                  ⚠ Any airport — none configured
                </span>
              )}
            </td>
            <td className="px-4 py-2">
              <ChargeCell
                amount={d.price}
                adult={d.appliesToAdult}
                child={d.appliesToChild}
                infant={d.appliesToInfant}
              />
            </td>
            <td className="px-4 py-2">
              <StatusBadge active={d.isActive} />
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
          label: "Airport (leave blank for any)",
          type: "select",
          options: airportOptions,
        },
        { name: "date", label: "Date", type: "date", required: true },
        {
          name: "price",
          label: "Travel charge (₹) — added automatically to the prices ticked below; leave blank for none",
          type: "number",
        },
        { name: "appliesToAdult", label: "Add to the Adult price", type: "checkbox" },
        { name: "appliesToChild", label: "Add to the Child price", type: "checkbox" },
        { name: "appliesToInfant", label: "Add to the Infant price", type: "checkbox" },
        { name: "label", label: "Label (optional)", type: "text" },
        { name: "isActive", label: "Active", type: "checkbox" },
      ]}
    />
  );
}
