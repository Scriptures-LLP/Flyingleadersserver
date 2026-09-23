import { ResourceCrudPage } from "../components/ResourceCrudPage";
import { StatusBadge } from "../components/StatusBadge";
import { thumbColumn } from "../components/thumbColumn";

type Category = {
  _id: string;
  label: string;
  slug: string;
  image?: string;
  imageUrl?: string | null;
  sortOrder: number;
  isActive: boolean;
};

export function CategoriesPage() {
  return (
    <ResourceCrudPage<Category>
      title="Categories"
      resourcePath="/admin/categories"
      columns={[
        thumbColumn<Category>("imageUrl", "Image"),
        { key: "label", label: "Label" },
        { key: "slug", label: "Slug" },
        { key: "sortOrder", label: "Sort order" },
        { key: "isActive", label: "Active", render: (c) => <StatusBadge active={c.isActive} /> },
      ]}
      fields={[
        { name: "label", label: "Label", type: "text", required: true },
        { name: "sortOrder", label: "Sort order", type: "number" },
        { name: "image", label: "Image", type: "file", previewUrlKey: "imageUrl" },
        { name: "isActive", label: "Active", type: "checkbox" },
      ]}
    />
  );
}
