/**
 * Page navigation for a server-paginated list.
 *
 * The list decides the page size — the API owns paging, so this only says which
 * page. First, last and a window around the current page are always shown, with
 * a gap marker where pages were skipped, so the control stays a fixed width as
 * the result set grows.
 *
 * Previous is disabled on the first page and Next on the last, which is what
 * makes the boundaries visible without extra text.
 */
import { ArrowRight, ChevronLeft } from "@/components/icons";
import { cn } from "@/lib/utils";
import IconButton from "./IconButton";

export interface PaginationProps {
  /** 1-based current page. */
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Accessible name, e.g. "Customer list pages". */
  label: string;
  className?: string;
}

type Slot = number | "gap";

/** First, last and ±1 around the current page, with gaps where pages were skipped. */
function pageSlots(page: number, pageCount: number): Slot[] {
  const wanted = new Set<number>([1, pageCount]);
  for (let offset = -1; offset <= 1; offset += 1) {
    const candidate = page + offset;
    if (candidate >= 1 && candidate <= pageCount) wanted.add(candidate);
  }

  const slots: Slot[] = [];
  let previous = 0;
  for (const value of [...wanted].sort((a, b) => a - b)) {
    if (previous !== 0 && value - previous > 1) slots.push("gap");
    slots.push(value);
    previous = value;
  }
  return slots;
}

const NUMBER_CLASS =
  "inline-flex size-control-sm items-center justify-center rounded-sm text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple";

export default function Pagination({
  page,
  pageCount,
  onPageChange,
  label,
  className,
}: PaginationProps) {
  if (pageCount <= 1) return null;

  const slots = pageSlots(page, pageCount);
  const isFirst = page <= 1;
  const isLast = page >= pageCount;

  return (
    <nav aria-label={label} className={cn("flex items-center justify-end gap-1", className)}>
      <IconButton
        label="Previous page"
        icon={<ChevronLeft />}
        size="sm"
        disabled={isFirst}
        onClick={() => onPageChange(page - 1)}
      />

      <ul className="flex items-center gap-1">
        {slots.map((slot, index) =>
          slot === "gap" ? (
            <li
              // Gaps are positional, not data — index is the stable identity here.
              key={`gap-${index}`}
              aria-hidden
              className="px-1 text-sm text-ink-muted"
            >
              …
            </li>
          ) : (
            <li key={slot}>
              <button
                type="button"
                aria-current={slot === page ? "page" : undefined}
                onClick={() => onPageChange(slot)}
                className={cn(
                  NUMBER_CLASS,
                  slot === page
                    ? "bg-purple-soft text-purple"
                    : "text-ink-body hover:bg-surface-2 hover:text-ink",
                )}
              >
                {slot}
              </button>
            </li>
          ),
        )}
      </ul>

      {/* The set ships no right-pointing chevron, so the forward step uses the
          arrow icon rather than mirroring the left chevron. See HANDOFF.md §4. */}
      <IconButton
        label="Next page"
        icon={<ArrowRight />}
        size="sm"
        disabled={isLast}
        onClick={() => onPageChange(page + 1)}
      />
    </nav>
  );
}
