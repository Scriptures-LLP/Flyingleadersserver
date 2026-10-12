import { ResourceCrudPage } from "../components/ResourceCrudPage";
import { StatusBadge } from "../components/StatusBadge";
import { SyncStatusCell } from "../components/SyncStatusBadge";
import { COVER_CROP } from "../lib/coverCrop";

type Country = {
  _id: string;
  name: string;
  slug: string;
  coverImage?: string;
  sortOrder: number;
  isActive: boolean;
  mysqlSync?: { status?: "pending" | "synced" | "failed" | "disabled"; lastError?: string };
};

export function CountriesPage() {
  return (
    <ResourceCrudPage<Country>
      title="Countries"
      resourcePath="/admin/countries"
      columns={[
        { key: "name", label: "Name" },
        { key: "slug", label: "Slug" },
        { key: "sortOrder", label: "Sort order" },
        { key: "isActive", label: "Active", render: (c) => <StatusBadge active={c.isActive} /> },
        {
          key: "mysqlSync",
          label: "Website",
          render: (c) => <SyncStatusCell resourcePath="/admin/countries" id={c._id} mysqlSync={c.mysqlSync} />,
        },
      ]}
      fields={[
        { name: "name", label: "Name", type: "text", required: true },
        { name: "sortOrder", label: "Sort order", type: "number" },
        { name: "coverImage", label: "Cover image", type: "file", crop: COVER_CROP.country },
        { name: "isActive", label: "Active", type: "checkbox" },
      ]}
    />
  );
}
