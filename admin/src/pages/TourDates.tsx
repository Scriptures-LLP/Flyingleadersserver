import { useQuery } from "@tanstack/react-query";

import { ResourceCrudPage } from "../components/ResourceCrudPage";
import { api } from "../lib/api";

type TourDate = {
  _id: string;
  tourId: string;
  airportId?: string | null;
  date: string;
  price: number;
  label?: string;
  isActive: boolean;
};

type Tour = { _id: string; title: string };
type Airport = { _id: string; code: string; name: string };

export function TourDatesPage() {
  const { data: tours } = useQuery({
    queryKey: ["/admin/tours"],
    queryFn: async () => (await api.get("/admin/tours")).data.items as Tour[],
  });
  const { data: airports } = useQuery({
    queryKey: ["/admin/airports"],
    queryFn: async () => (await api.get("/admin/airports")).data.items as Airport[],
  });

  const tourLabel = (id: string) => tours?.find((t) => t._id === id)?.title ?? "…";
  const airportLabel = (id?: string | null) =>
    id ? (airports?.find((a) => a._id === id)?.code ?? "…") : "Any airport";

  return (
    <ResourceCrudPage<TourDate>
      title="Tour Dates"
      resourcePath="/admin/tour-dates"
      columns={[
        { key: "tourId", label: "Tour", render: (d) => tourLabel(d.tourId) },
        { key: "airportId", label: "Airport", render: (d) => airportLabel(d.airportId) },
        { key: "date", label: "Date", render: (d) => new Date(d.date).toLocaleDateString("en-IN") },
        { key: "price", label: "Add-on price (₹)" },
        { key: "isActive", label: "Active", render: (d) => (d.isActive ? "Yes" : "No") },
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
          label: "Airport (leave blank for any)",
          type: "select",
          options: (airports ?? []).map((a) => ({ value: a._id, label: `${a.code} — ${a.name}` })),
        },
        { name: "date", label: "Date", type: "date", required: true },
        { name: "price", label: "Add-on price (₹, on top of tour base price)", type: "number", required: true },
        { name: "label", label: "Label (optional)", type: "text" },
        { name: "isActive", label: "Active", type: "checkbox" },
      ]}
    />
  );
}
