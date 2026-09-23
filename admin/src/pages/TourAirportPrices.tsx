import { useQuery } from "@tanstack/react-query";

import { ResourceCrudPage } from "../components/ResourceCrudPage";
import { StatusBadge } from "../components/StatusBadge";
import { api } from "../lib/api";

type TourAirportPrice = { _id: string; tourId: string; airportId: string; addonPrice: number; isActive: boolean };
type Tour = { _id: string; title: string };
type Airport = { _id: string; code: string; name: string };

export function TourAirportPricesPage() {
  const { data: tours } = useQuery({
    queryKey: ["/admin/tours"],
    queryFn: async () => (await api.get("/admin/tours")).data.items as Tour[],
  });
  const { data: airports } = useQuery({
    queryKey: ["/admin/airports"],
    queryFn: async () => (await api.get("/admin/airports")).data.items as Airport[],
  });

  const tourLabel = (id: string) => tours?.find((t) => t._id === id)?.title ?? "…";
  const airportLabel = (id: string) => airports?.find((a) => a._id === id)?.code ?? "…";

  return (
    <ResourceCrudPage<TourAirportPrice>
      title="Tour Airport Prices"
      resourcePath="/admin/tour-airport-prices"
      // Group every tour's rows together (then by airport) so each tour reads
      // as one block, with a dropdown to view just one tour on its own.
      sortItems={(a, b) =>
        tourLabel(a.tourId).localeCompare(tourLabel(b.tourId)) ||
        airportLabel(a.airportId).localeCompare(airportLabel(b.airportId))
      }
      groupBy={{ label: "Tour", value: (r) => r.tourId, display: (r) => tourLabel(r.tourId) }}
      columns={[
        { key: "tourId", label: "Tour", render: (r) => tourLabel(r.tourId) },
        { key: "airportId", label: "Airport", render: (r) => airportLabel(r.airportId) },
        { key: "addonPrice", label: "Add-on price (₹)", render: (r) => (r.addonPrice ? `₹${r.addonPrice}` : "— (free)") },
        { key: "isActive", label: "Active", render: (r) => <StatusBadge active={r.isActive} /> },
      ]}
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
