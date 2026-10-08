/**
 * The field shell shared by the text-ish controls: label, control, then hint
 * or error. `Input`, `Select` and `Checkbox` all compose it so a form cannot
 * drift into three different label styles.
 *
 * The control is 44px tall (`--sp-control-h-md`), the handoff's minimum tap
 * target. Hint and error are wired to the control with `aria-describedby`, and
 * an error also sets `aria-invalid`, so the message is announced rather than
 * only seen.
 */
import { useId } from "react";

import { cn } from "@/lib/utils";

export interface FieldProps {
  label: string;
  /** Helper text under the control. Hidden from a11y when `error` is set. */
  hint?: string;
  /** Replaces the hint and marks the control invalid. */
  error?: string;
  /** Rendered after the label — e.g. an optional count or a unit. */
  trailing?: React.ReactNode;
  /**
   * Keeps the label for assistive technology but does not draw it — for a
   * control in a toolbar whose surrounding section already says what it is
   * (the day view's status filter). The accessible name is unchanged; only
   * the pixels go away.
   */
  hideLabel?: boolean;
  className?: string;
  children: (ids: { controlId: string; describedBy: string | undefined }) => React.ReactNode;
}

export const CONTROL_CLASS =
  "w-full rounded-md border border-line bg-surface text-sm text-ink transition-colors placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-purple disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-disabled";

export default function Field({
  label,
  hint,
  error,
  trailing,
  hideLabel = false,
  className,
  children,
}: FieldProps) {
  const controlId = useId();
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className={cn("flex items-baseline justify-between gap-2", hideLabel && "sr-only")}>
        <label htmlFor={controlId} className="text-sm font-medium text-ink">
          {label}
        </label>
        {trailing}
      </div>

      {children({ controlId, describedBy })}

      {error ? (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
