/**
 * A pill used for a filter or a tag.
 *
 * Without `onSelect` it is a plain tag; with it, it becomes a toggle button
 * carrying `aria-pressed`, so a screen reader announces which filters are
 * active rather than leaving the colour to carry it. A toggle is a real
 * control and therefore gets the full 44px tap target; a passive tag may sit
 * at the 30px `--sp-control-h-sm`.
 */
import { cn } from "@/lib/utils";

export interface ChipProps {
  children: React.ReactNode;
  /** Present makes it a toggle; omit it for a passive tag. */
  onSelect?: () => void;
  selected?: boolean;
  disabled?: boolean;
  /** Leading glyph — keep it decorative and let the label carry the meaning. */
  icon?: React.ReactNode;
  className?: string;
}

export default function Chip({
  children,
  onSelect,
  selected = false,
  disabled = false,
  icon,
  className,
}: ChipProps) {
  const toggleable = typeof onSelect === "function";

  const tone = cn(
    "inline-flex items-center gap-1.5 rounded-pill border text-sm whitespace-nowrap transition-colors",
    toggleable ? "h-control px-4" : "h-control-sm px-3",
    disabled
      ? "cursor-not-allowed border-line bg-surface-2 text-ink-disabled"
      : selected
        ? "border-purple bg-purple-soft text-purple"
        : "border-line bg-surface text-ink-body hover:bg-surface-2 hover:text-ink",
  );

  if (!toggleable) {
    return (
      <span className={cn(tone, className)}>
        {icon ? (
          <span aria-hidden className="text-base">
            {icon}
          </span>
        ) : null}
        {children}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        tone,
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple",
        className,
      )}
    >
      {icon ? (
        <span aria-hidden className="text-base">
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
}
