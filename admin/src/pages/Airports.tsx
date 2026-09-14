import { ResourceCrudPage } from "../components/ResourceCrudPage";

type Airport = { _id: string; code: string; name: string; isActive: boolean };

export function AirportsPage() {
  return (
    <ResourceCrudPage<Airport>
      title="Airports"
      resourcePath="/admin/airports"
      columns={[
        { key: "code", label: "Code" },
        { key: "name", label: "Name" },
        { key: "isActive", label: "Active", render: (a) => (a.isActive ? "Yes" : "No") },
      ]}
      fields={[
        { name: "code", label: "IATA code", type: "text", required: true },
        { name: "name", label: "Name", type: "text", required: true },
        { name: "isActive", label: "Active", type: "checkbox" },
      ]}
    />
  );
}
