/**
 * A short hint attached to any control.
 *
 * It opens on hover and on keyboard focus — focus is the path that matters,
 * since a tooltip only a mouse can reach is not an accessible way to explain a
 * control. Escape and blur dismiss it.
 *
 * The trigger is cloned to receive `aria-describedby` while open, so the text
 * is announced as a description rather than replacing the control's name. Use
 * `IconButton`'s `label` for the name and this for the explanation.
 */
import { cloneElement, useId, useState } from "react";

import { cn } from "@/lib/utils";

export type TooltipPlacement = "top" | "bottom";

export interface TooltipProps {
  content: React.ReactNode;
  /** The control the tooltip explains. Must accept an `aria-describedby`. */
  children: React.ReactElement<{ "aria-describedby"?: string }>;
  placement?: TooltipPlacement;
  className?: string;
}

const PLACEMENT: Record<TooltipPlacement, string> = {
  top: "bottom-full left-1/2 mb-2 -translate-x-1/2",
  bottom: "top-full left-1/2 mt-2 -translate-x-1/2",
};

export default function Tooltip({ content, children, placement = "top", className }: TooltipProps) {
  const tooltipId = useId();
  const [open, setOpen] = useState(false);

  const trigger = cloneElement(children, {
    "aria-describedby": open ? tooltipId : children.props["aria-describedby"],
  });

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      {trigger}

      {open ? (
        <span
          role="tooltip"
          id={tooltipId}
          className={cn(
            "pointer-events-none absolute z-50 w-max max-w-56 rounded-md bg-navy px-2.5 py-1.5 text-2xs text-ink-on-dark shadow-menu",
            PLACEMENT[placement],
            className,
          )}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
