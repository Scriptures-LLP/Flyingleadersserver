import { ResourceCrudPage } from "../components/ResourceCrudPage";

type HomeCover = { _id: string; title?: string; isActive: boolean; sortOrder: number };

export function HomeCoversPage() {
  return (
    <ResourceCrudPage<HomeCover>
      title="Home Covers"
      resourcePath="/admin/home-covers"
      columns={[
        { key: "title", label: "Title" },
        { key: "sortOrder", label: "Sort order" },
        { key: "isActive", label: "Active", render: (c) => (c.isActive ? "Yes" : "No") },
      ]}
      fields={[
        { name: "title", label: "Title", type: "text" },
        { name: "image", label: "Image (required)", type: "file" },
        { name: "sortOrder", label: "Sort order", type: "number" },
        { name: "isActive", label: "Active", type: "checkbox" },
      ]}
    />
  );
}
