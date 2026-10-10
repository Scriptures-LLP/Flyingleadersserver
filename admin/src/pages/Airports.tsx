import { ResourceCrudPage } from "../components/ResourceCrudPage";
import { StatusBadge } from "../components/StatusBadge";
import { SyncStatusCell } from "../components/SyncStatusBadge";

type Airport = {
  _id: string;
  code: string;
  name: string;
  isActive: boolean;
  mysqlSync?: { status?: "pending" | "synced" | "failed" | "disabled"; lastError?: string };
};

export function AirportsPage() {
  return (
    <ResourceCrudPage<Airport>
      title="Airports"
      resourcePath="/admin/airports"
      columns={[
        { key: "code", label: "Code" },
        { key: "name", label: "Name" },
        { key: "isActive", label: "Active", render: (a) => <StatusBadge active={a.isActive} /> },
        {
          key: "mysqlSync",
          label: "Website",
          render: (a) => <SyncStatusCell resourcePath="/admin/airports" id={a._id} mysqlSync={a.mysqlSync} />,
        },
      ]}
      fields={[
        { name: "code", label: "IATA code", type: "text", required: true },
        { name: "name", label: "Name", type: "text", required: true },
        { name: "isActive", label: "Active", type: "checkbox" },
      ]}
    />
  );
}
