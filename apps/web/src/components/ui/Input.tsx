/**
 * A single-line text field with its label, hint and error already wired.
 *
 * Pass `type` for the native variant; the component only adds presentation.
 * Server-side validation errors land in `error` and surface on the field that
 * caused them.
 */
import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";
import Field, { CONTROL_CLASS } from "./Field";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  /** Rendered after the label — e.g. a character count. */
  trailing?: React.ReactNode;
  /** Stretch to the field width. Off for controls that sit inline. */
  fullWidth?: boolean;
}

export default function Input({
  label,
  hint,
  error,
  trailing,
  fullWidth = true,
  className,
  disabled = false,
  ...rest
}: InputProps) {
  return (
    <Field label={label} hint={hint} error={error} trailing={trailing}>
      {({ controlId, describedBy }) => (
        <input
          id={controlId}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(CONTROL_CLASS, "h-control px-3", !fullWidth && "w-auto", className)}
          {...rest}
        />
      )}
    </Field>
  );
}
