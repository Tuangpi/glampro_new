/**
 * A pill used for a filter or a tag.
 *
 * The handoff draws two related things. `.chip` (screens 01, 05) is a passive
 * context pill in the top bar: `8px 14px` padding, `13px`/`600`, `#2B3160` on
 * `#F3F4FA` over a 1px `#E3E6F2` border. `.toggle-chip` (screen 03) is the
 * selectable one, and its selected state is a **solid `--sp-purple` fill with
 * white text** — not a tint. That is what `selected` renders here.
 *
 * Both the padding and the type are snapped to the token scale per
 * [ADR 0006]: 8px/14px are `py-2 px-3.5` exactly, and the handoff's 13px sits
 * nearer `text-sm` (12.5px) than `text-base`, so it is `text-sm`. Its `#2B3160`
 * has no token and is nearest `--sp-text-primary`, so unselected chips read
 * `text-ink`.
 *
 * A toggle is a real control and therefore keeps the full 44px tap target; the
 * handoff's own `.toggle-chip` computes to ~30px, which is the same recorded
 * conflict as `Button`'s height and is deliberately not copied.
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
    "inline-flex items-center gap-1.5 rounded-pill border px-3.5 text-sm whitespace-nowrap transition-colors",
    toggleable ? "h-control" : "py-2",
    disabled
      ? "cursor-not-allowed border-line bg-surface-2 text-ink-disabled"
      : selected
        ? "border-purple bg-purple text-white"
        : "border-line bg-surface-2 text-ink hover:border-purple",
  );

  // `.chip svg { color: #8A90AA }` in the handoff; on the purple selected fill
  // the glyph has to follow the white label rather than stay muted.
  const iconTone = selected && !disabled ? "text-white" : "text-ink-muted";

  if (!toggleable) {
    return (
      <span className={cn(tone, className)}>
        {icon ? (
          <span aria-hidden className={cn("text-base", iconTone)}>
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
        <span aria-hidden className={cn("text-base", iconTone)}>
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
}
