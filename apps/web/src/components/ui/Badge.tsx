/**
 * A small status pill — the handoff's `--sp-radius-pill` badge.
 *
 * Presentational by default. `Badge` carries no interaction; when the thing it
 * labels is clickable, wrap it in a real button or use `Chip`.
 *
 * Only the semantic tones the handoff actually defines are offered. There is
 * no amber/warning variant because the token file exposes amber as a gradient
 * for the dashboard income tile, not as a surface or text colour. Note the
 * handoff's own `.status.progress` and `.tier.gold` *do* use an amber surface
 * (`#FFF4DE`) and text (`#B9740A`), and neither colour is near any token, so
 * they are open question Q23 rather than an invented variant — see
 * [ADR 0006].
 *
 * Geometry is the handoff's `.tier` / `.status`: `800` weight, `4px 9px`
 * padding, pill radius. The handoff's 10.5px has no token and sits exactly
 * between `text-2xs` (10px) and `text-xs` (11px); per [ADR 0006] ties round
 * up, so this is `text-xs`.
 */
import { cn } from "@/lib/utils";

export type BadgeVariant = "neutral" | "success" | "danger" | "purple";

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
  purple: "bg-purple-soft text-purple",
};

const DOTS: Record<BadgeVariant, string> = {
  neutral: "bg-ink-muted",
  success: "bg-success",
  danger: "bg-danger",
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
