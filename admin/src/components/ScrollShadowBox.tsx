import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Wraps a wide table in a horizontally-scrollable box, with a fading shadow on
 * whichever edge still has more columns to scroll to. Several of these tables
 * (Bookings especially, 12 columns) never fit a normal viewport no matter the
 * screen size — without this, content past the edge just looks silently cut
 * off rather than scrollable.
 */
export function ScrollShadowBox({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      setCanScrollLeft(el.scrollLeft > 4);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [children]);

  return (
    <div className="relative">
      <div ref={ref} className={`overflow-x-auto ${className}`}>
        {children}
      </div>
      {canScrollLeft && (
        <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-white to-transparent" />
      )}
      {canScrollRight && (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent" />
      )}
    </div>
  );
}
