import { ResourceCrudPage } from "../components/ResourceCrudPage";

type Category = { _id: string; label: string; slug: string; image?: string; sortOrder: number; isActive: boolean };

export function CategoriesPage() {
  return (
    <ResourceCrudPage<Category>
      title="Categories"
      resourcePath="/admin/categories"
      columns={[
        { key: "label", label: "Label" },
        { key: "slug", label: "Slug" },
        { key: "sortOrder", label: "Sort order" },
        { key: "isActive", label: "Active", render: (c) => (c.isActive ? "Yes" : "No") },
      ]}
      fields={[
        { name: "label", label: "Label", type: "text", required: true },
        { name: "sortOrder", label: "Sort order", type: "number" },
        { name: "image", label: "Image", type: "file" },
        { name: "isActive", label: "Active", type: "checkbox" },
      ]}
    />
  );
}
