/**
 * A small status pill — the handoff's `--sp-radius-pill` badge.
 *
 * Presentational by default. `Badge` carries no interaction; when the thing it
 * labels is clickable, wrap it in a real button or use `Chip`.
 *
 * Only the semantic tones the handoff actually defines are offered. The amber
 * `warning` tone came from the handoff's own `.status.progress` (screen 05) and
 * `.tier.gold` (screen 07), which are `#FFF4DE` on `#B9740A`. Q23 recorded that
 * neither colour was near any token; `--sp-amber-text` and `--sp-amber-bg` were
 * added to `design/handoff/tokens/tokens.css` to settle that, and the copy was
 * re-taken, so this is the designer's pair rather than an invented one.
 *
 * Geometry is the handoff's `.tier` / `.status`: `800` weight, `4px 9px`
 * padding, pill radius. The handoff's 10.5px has no token and sits exactly
 * between `text-2xs` (10px) and `text-xs` (11px); per [ADR 0006] ties round
 * up, so this is `text-xs`.
 */
import { cn } from "@/lib/utils";

export type BadgeVariant = "neutral" | "success" | "danger" | "warning" | "purple";

export interface BadgeProps {
  variant?: BadgeVariant;
  /** Dot before the label — useful when the colour must not carry the meaning. */
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}

const VARIANTS: Record<BadgeVariant, string> = {
  neutral: "bg-surface-2 text-ink-body",
  success: "bg-success-soft text-success-text",
  danger: "bg-danger/10 text-danger",
  // The handoff's `.status.progress` (screen 05) and `.tier.gold` (screen 07)
  // pair. Q23 for long left this variant out because the pair had no token;
  // `--sp-amber-text` / `--sp-amber-bg` were added to the handoff token file to
  // close it, so the colours are now the designer's own.
  warning: "bg-warning-soft text-warning",
  purple: "bg-purple-soft text-purple",
};

const DOTS: Record<BadgeVariant, string> = {
  neutral: "bg-ink-muted",
  success: "bg-success",
  danger: "bg-danger",
  warning: "bg-warning",
  purple: "bg-purple",
};

export default function Badge({
  variant = "neutral",
  dot = false,
  children,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-2.25 py-1 text-xs font-heavy whitespace-nowrap",
        VARIANTS[variant],
        className,
      )}
    >
      {dot ? <span aria-hidden className={cn("size-1.5 rounded-pill", DOTS[variant])} /> : null}
      {children}
    </span>
  );
}
