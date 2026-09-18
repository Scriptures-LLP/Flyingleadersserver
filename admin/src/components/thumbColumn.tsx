import type { ColumnConfig } from "./ResourceCrudPage";

/**
 * A list-table column that renders a small image thumbnail from a URL field on
 * the item (e.g. "imageUrl"/"url"), so the admin can see each uploaded image at
 * a glance. `urlKey` is read off the item; missing images show a dash.
 */
export function thumbColumn<T extends { _id: string }>(
  urlKey: string,
  label = "Preview",
): ColumnConfig<T> {
  return {
    key: urlKey,
    label,
    render: (item) => {
      const url = (item as Record<string, unknown>)[urlKey] as string | undefined;
      return url ? (
        <img src={url} alt="" className="h-10 w-16 rounded border border-slate-200 object-cover" />
      ) : (
        <span className="text-slate-400">—</span>
      );
    },
  };
}
