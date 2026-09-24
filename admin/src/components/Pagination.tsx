import { useEffect, useState } from "react";

/**
 * Client-side pagination for admin tables. The list endpoints return the full
 * set, so we slice locally rather than round-trip the server. Pair the hook
 * (which owns the page state + the current slice) with the <Pagination/> footer.
 *
 *   const pager = usePagination(items, 10, search); // resets to page 1 when `search` changes
 *   {pager.pageItems.map(...)}
 *   <Pagination {...pager} onPage={pager.setPage} label="bookings" />
 */
export function usePagination<T>(items: T[] | undefined, pageSize = 6, resetKey?: unknown) {
  const [page, setPage] = useState(1);
  const total = items?.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // Jump back to the first page whenever the source list is re-filtered.
  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  // Keep the page in range if the list shrinks (delete, filter, refetch).
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const current = Math.min(page, pageCount);
  const start = (current - 1) * pageSize;
  const pageItems = (items ?? []).slice(start, start + pageSize);

  return { page: current, setPage, pageCount, pageItems, total, pageSize };
}

// Compact page list with ellipses: always shows first + last + the current
// page and its neighbours, e.g. 1 … 4 [5] 6 … 20.
function pageList(page: number, pageCount: number): (number | "gap")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const wanted = new Set([1, 2, pageCount - 1, pageCount, page - 1, page, page + 1]);
  const shown = [...wanted].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  let prev = 0;
  for (const p of shown) {
    if (p - prev > 1) out.push("gap");
    out.push(p);
    prev = p;
  }
  return out;
}

const arrowBtn =
  "flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 text-neutral-700 transition hover:border-neutral-900 hover:bg-neutral-900 hover:text-white disabled:cursor-not-allowed disabled:border-neutral-200 disabled:bg-transparent disabled:text-neutral-300 disabled:hover:bg-transparent";

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
  label = "rows",
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  label?: string;
}) {
  // Nothing to page through — a single page fits everything.
  if (total <= pageSize) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-neutral-200 bg-white px-4 py-3">
      <span className="text-sm text-neutral-500">
        Showing <span className="font-semibold text-neutral-900">{from}–{to}</span> of{" "}
        <span className="font-semibold text-neutral-900">{total}</span> {label}
      </span>

      <div className="flex items-center gap-1.5">
        <button onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page" className={arrowBtn}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        {pageList(page, pageCount).map((p, i) =>
          p === "gap" ? (
            <span key={`gap-${i}`} className="px-1 text-sm text-neutral-400">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p)}
              aria-current={p === page ? "page" : undefined}
              className={
                p === page
                  ? "h-9 min-w-9 rounded-lg bg-gradient-to-r from-red-600 to-red-500 px-3 text-sm font-bold text-white shadow-sm shadow-red-600/30"
                  : "h-9 min-w-9 rounded-lg border border-neutral-200 px-3 text-sm font-semibold text-neutral-700 transition hover:border-neutral-900 hover:text-neutral-900"
              }
            >
              {p}
            </button>
          ),
        )}

        <button onClick={() => onPage(page + 1)} disabled={page >= pageCount} aria-label="Next page" className={arrowBtn}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
