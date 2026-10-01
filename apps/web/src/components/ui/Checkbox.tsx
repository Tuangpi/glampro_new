/**
 * A checkbox with its label as the tap target.
 *
 * The native input stays in the DOM and keeps its own keyboard and screen
 * reader behaviour (Space toggles it); only the box is tinted with the brand
 * colour. The wrapping label is padded out to `--sp-control-h-md`, so the
 * 44px minimum tap target is the row the user actually clicks, not the 20px box.
 */
import { useId } from "react";

import { cn } from "@/lib/utils";

export interface CheckboxProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "className"
> {
  label: React.ReactNode;
  /** Helper text under the label. */
  hint?: string;
  error?: string;
  className?: string;
}

export default function Checkbox({
  label,
  hint,
  error,
  className,
  disabled = false,
  ...rest
}: CheckboxProps) {
  const controlId = useId();
  const messageId = error || hint ? `${controlId}-message` : undefined;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label
        htmlFor={controlId}
        className="flex min-h-control cursor-pointer items-center gap-3 text-sm text-ink-body select-none has-disabled:cursor-not-allowed has-disabled:text-ink-disabled"
      >
        <input
          id={controlId}
          type="checkbox"
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={messageId}
          className="size-5 shrink-0 accent-purple disabled:cursor-not-allowed"
          {...rest}
        />
        <span>{label}</span>
      </label>

      {error ? (
        <p id={messageId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
