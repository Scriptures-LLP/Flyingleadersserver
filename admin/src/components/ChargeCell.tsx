// How a charge (a tour date's travel charge, or an airport charge) reads in a
// table: the amount, and which traveller categories it is automatically added
// to. It's folded into those categories' per-person prices when a booking is
// priced — customers never see it as a separate line.
export function ChargeCell({
  amount,
  adult,
  child,
  infant,
}: {
  amount?: number;
  adult?: boolean;
  child?: boolean;
  infant?: boolean;
}) {
  if (!amount) return <span className="text-xs text-neutral-400">No charge</span>;

  const categories = [adult && "Adult", child && "Child", infant && "Infant"].filter(Boolean) as string[];
  return (
    <div>
      <span className="font-semibold text-neutral-800">₹{amount.toLocaleString("en-IN")}</span>
      {categories.length > 0 ? (
        <div className="text-xs text-neutral-500">Added to: {categories.join(", ")}</div>
      ) : (
        <div className="text-xs font-medium text-red-600">Not added to any price — tick a category</div>
      )}
    </div>
  );
}
