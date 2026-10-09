import { ResourceCrudPage } from "../components/ResourceCrudPage";
import { StatusBadge } from "../components/StatusBadge";
import { COVER_CROP } from "../lib/coverCrop";

type Country = { _id: string; name: string; slug: string; coverImage?: string; sortOrder: number; isActive: boolean };

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
