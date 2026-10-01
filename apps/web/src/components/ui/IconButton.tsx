/**
 * An icon-only button.
 *
 * `label` is required and becomes both the accessible name and the tooltip,
 * so an icon-only control can never ship without a name. The icon itself
 * stays decorative — the label carries the meaning.
 *
 * `sm` is 30px square and counts as one of the documented small-control cases;
 * the default `md` is the 44px minimum tap target.
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type IconButtonSize = "sm" | "md" | "lg";
export type IconButtonVariant = "ghost" | "solid" | "outline";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name. Also used as the native tooltip. */
  label: string;
  icon: ReactNode;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
}

const BASE =
  "inline-flex shrink-0 items-center justify-center rounded-sm text-ink-body transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple disabled:cursor-not-allowed disabled:opacity-60";

const VARIANTS: Record<IconButtonVariant, string> = {
  ghost: "bg-transparent hover:bg-surface-2 hover:text-ink",
  solid: "bg-purple text-white hover:bg-purple-dark",
  outline: "border border-line bg-surface hover:bg-surface-2 hover:text-ink",
};

const SIZES: Record<IconButtonSize, string> = {
  sm: "size-control-sm text-base",
  md: "size-control text-md",
  lg: "size-control-lg text-lg",
};

export default function IconButton({
  label,
  icon,
  size = "md",
  variant = "ghost",
  className,
  type = "button",
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
