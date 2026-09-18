import { ResourceCrudPage } from "../components/ResourceCrudPage";
import { thumbColumn } from "../components/thumbColumn";
import { COVER_CROP } from "../lib/coverCrop";

type HomeCover = {
  _id: string;
  title?: string;
  altText?: string;
  imageUrl?: string | null;
  isActive: boolean;
  sortOrder: number;
};

export function HomeCoversPage() {
  return (
    <ResourceCrudPage<HomeCover>
      title="Home Covers"
      resourcePath="/admin/home-covers"
      columns={[
        thumbColumn<HomeCover>("imageUrl", "Home Cover"),
        { key: "title", label: "Title" },
        { key: "altText", label: "Alt text" },
        { key: "sortOrder", label: "Sort order" },
        { key: "isActive", label: "Active", render: (c) => (c.isActive ? "Yes" : "No") },
      ]}
      fields={[
        { name: "title", label: "Title", type: "text" },
        { name: "altText", label: "Alt text / image title (e.g. Dubai Tour)", type: "text" },
        { name: "image", label: "Image (required)", type: "file", previewUrlKey: "imageUrl", crop: COVER_CROP.home },
        { name: "sortOrder", label: "Sort order", type: "number" },
        { name: "isActive", label: "Active", type: "checkbox" },
      ]}
    />
  );
}
