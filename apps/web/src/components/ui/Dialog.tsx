/**
 * The dialog shell that `Modal` and `Drawer` are built from.
 *
 * A dialog is the one place where focus has to be actively managed: on open
 * focus moves into the panel and the page behind is unreachable by keyboard,
 * and on close focus returns to whatever opened it. Tab is wrapped at both
 * ends so it cannot escape the panel while it is open, Escape dismisses, and
 * the page behind cannot scroll.
 *
 * Rendered through a portal so it stacks above the app shell regardless of
 * where it sits in the tree.
 */
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

import { X } from "@/components/icons";
import { cn } from "@/lib/utils";
import IconButton from "./IconButton";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Names the dialog. Required — an unnamed dialog is announced as nothing. */
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  /** Where the panel sits in the overlay. */
  containerClassName?: string;
  /** The panel's own geometry. */
  panelClassName?: string;
  showClose?: boolean;
  closeLabel?: string;
}

export default function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  containerClassName,
  panelClassName,
  showClose = true,
  closeLabel = "Close",
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Captured once: the cleanup below runs after the node may be unmounted,
    // and reading panel.current there would see a different (or null) node.
    const node = panel.current;
    // Focus the panel itself rather than its first control: the dialog opens
    // with its title announced, and the user then tabs into the content.
    node?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
      // Only restore if focus is still inside the dialog — otherwise the user
      // has already moved on and yanking focus back would be hostile.
      if (node?.contains(document.activeElement) || document.activeElement === document.body) {
        previouslyFocused?.focus?.();
      }
    };
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const container = panel.current;
    if (!container) return;

    const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusable.length === 0) {
      event.preventDefault();
      container.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || active === container)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-50 flex bg-navy/40",
        "items-center justify-center p-4",
        containerClassName,
      )}
    >
      {/* The backdrop is a plain div: a button would put "dismiss" in the tab
          order, where Escape and the close button already cover it. */}
      <div aria-hidden className="absolute inset-0" onClick={onClose} />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={cn(
          "relative flex max-h-full flex-col overflow-hidden bg-surface shadow-menu focus-visible:outline-none",
          panelClassName,
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg text-ink">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-0.5 text-sm text-ink-muted">
                {description}
              </p>
            ) : null}
          </div>

          {showClose ? <IconButton label={closeLabel} icon={<X />} onClick={onClose} /> : null}
        </header>

        {children ? <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div> : null}

        {footer ? (
          <footer className="border-t border-line bg-surface-muted px-5 py-3">{footer}</footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
