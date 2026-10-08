/**
 * A native `<select>` styled to match `Input`.
 *
 * It stays a real select on purpose: keyboard behaviour, the mobile picker and
 * screen-reader support come from the platform, and the handoff's chevron is
 * drawn over the native arrow (`appearance-none`).
 */
import type { ChangeEvent, SelectHTMLAttributes } from "react";
import { useState } from "react";

import { ChevronDown } from "@/components/icons";
import { cn } from "@/lib/utils";
import Field, { CONTROL_CLASS } from "./Field";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  label: string;
  /** Options to render. A `placeholder` option is added when `value` is empty. */
  options: SelectOption[];
  placeholder?: string;
  hint?: string;
  error?: string;
  trailing?: React.ReactNode;
  /** See `FieldProps.hideLabel` — the name stays, the pixels go. */
  hideLabel?: boolean;
  onChange?: SelectHTMLAttributes<HTMLSelectElement>["onChange"];
}

export default function Select({
  label,
  options,
  placeholder = "Select…",
  hint,
  error,
  trailing,
  hideLabel = false,
  className,
  disabled = false,
  onChange,
  ...rest
}: SelectProps) {
  // An uncontrolled select has no `value` prop to read, so the empty-look is
  // tracked locally and refreshed on change; a controlled one is driven by its
  // own prop and never disagrees with the DOM.
  const [selected, setSelected] = useState(rest.value ?? rest.defaultValue ?? "");
  const isEmpty = (rest.value ?? selected) === "";

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelected(event.target.value);
    onChange?.(event);
  };

  return (
    <Field label={label} hint={hint} error={error} trailing={trailing} hideLabel={hideLabel}>
      {({ controlId, describedBy }) => (
        <div className="relative">
          <select
            id={controlId}
            disabled={disabled}
            onChange={handleChange}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(
              CONTROL_CLASS,
              "h-control appearance-none pr-10 pl-3",
              // Nothing chosen yet: show the placeholder in the muted token.
              isEmpty && "text-ink-muted",
              className,
            )}
            {...rest}
          >
            {/*
              `hidden`, not `disabled`: a disabled first option is skipped when the
              browser resolves the default selection, which would silently start the
              field on the first real option. Hidden keeps it as the empty default
              while dropping it from the open list once something is chosen.
            */}
            {placeholder ? (
              <option value="" hidden>
                {placeholder}
              </option>
            ) : null}
            {options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-base text-ink-muted"
          />
        </div>
      )}
    </Field>
  );
}
