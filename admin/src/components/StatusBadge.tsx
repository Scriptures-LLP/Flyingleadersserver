// A small pill for boolean status (active / inactive, featured / not, …). Green
// with a dot signals the positive/on state; neutral grey signals off. The green
// is the one sanctioned exception to the red/black/white palette — it carries
// "active/healthy" meaning that red or grey can't.
export function StatusBadge({
  active,
  activeLabel = "Active",
  inactiveLabel = "Inactive",
}: {
  active?: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
        active ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-green-500" : "bg-neutral-400"}`} />
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}
