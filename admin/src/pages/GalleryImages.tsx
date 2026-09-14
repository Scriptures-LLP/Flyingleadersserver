import { ResourceCrudPage } from "../components/ResourceCrudPage";

type GalleryImage = {
  _id: string;
  title?: string;
  kind: "tour" | "celebration";
  isFeatured: boolean;
  isActive: boolean;
  sortOrder: number;
};

export function GalleryImagesPage() {
  return (
    <ResourceCrudPage<GalleryImage>
      title="Gallery Images"
      resourcePath="/admin/gallery-images"
      columns={[
        { key: "title", label: "Title" },
        { key: "kind", label: "Kind" },
        { key: "isFeatured", label: "Featured", render: (g) => (g.isFeatured ? "Yes" : "No") },
        { key: "isActive", label: "Active", render: (g) => (g.isActive ? "Yes" : "No") },
      ]}
      fields={[
        { name: "title", label: "Title", type: "text" },
        { name: "altText", label: "Alt text", type: "text" },
        {
          name: "kind",
          label: "Kind",
          type: "select",
          allowBlank: false,
          options: [
            { value: "tour", label: "Tour" },
            { value: "celebration", label: "Celebration" },
          ],
        },
        { name: "file", label: "Image", type: "file" },
        { name: "sortOrder", label: "Sort order", type: "number" },
        { name: "isFeatured", label: "Featured", type: "checkbox" },
        { name: "isActive", label: "Active", type: "checkbox" },
      ]}
    />
  );
}
