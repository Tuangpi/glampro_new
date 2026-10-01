/**
 * The primary action button.
 *
 * Sizes are the handoff control heights: `sm` 30px, `md` 44px, `lg` 52px.
 * `md` is the 44px minimum tap target, so it is the default; `sm` exists only
 * for the documented small-stepper / overflow-menu cases and should be used
 * with a larger hit area around it.
 *
 * Sized to the handoff's `.btn`: `700` weight and an 18px horizontal padding,
 * both of which its token file omits — the padding rounds to `px-4.5`, the
 * weight is the shared `font-bold`. Its *height* is the one deliberate
 * departure. The handoff draws `.btn` between 37px (screens 06–11, `padding:
 * 11px 18px`) and ~43px (screens 01–02, `padding: 13px`) — it contradicts
 * itself — while `docs/roadmap.md` requires every control to clear 44px and
 * `--sp-control-h-md` is the token the handoff defines for "standard buttons".
 * The app takes the token. See [ADR 0006].
 *
 * `cn` joins class strings without resolving conflicts, so `variant` and
 * `size` are the supported way to change appearance. `className` is for
 * layout (width, margin) — a conflicting colour utility in it will lose to
 * the variant's own colour.
 */
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Dims the button and blocks activation while an action is in flight. */
  loading?: boolean;
}

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-md font-bold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple disabled:cursor-not-allowed disabled:opacity-60";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-purple text-white shadow-purple-btn hover:bg-purple-dark",
  secondary: "border border-line bg-surface text-ink hover:bg-surface-2",
  ghost: "text-ink-body hover:bg-surface-2",
  danger: "border border-line bg-surface text-danger hover:bg-danger/10",
  success: "bg-success text-white shadow-green-btn hover:brightness-95",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-control-sm px-3 text-xs",
  md: "h-control px-4.5 text-base",
  lg: "h-control-lg px-6 text-base",
};

export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  className,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      {...rest}
    >
      {children}
    </button>
  );
}
