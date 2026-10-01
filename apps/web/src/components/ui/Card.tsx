/**
 * A surface panel: the handoff's `--sp-radius-xl` card that screens use for
 * sections, the cart panel and receipt boxes.
 *
 * Every slot is optional, so a card can be a bare container or a titled
 * section with actions and a footer. The title renders as an `h3` because
 * cards sit below the page heading in the handoff frames; a card nested inside
 * another card should pass its own title markup through `title`.
 */
import { cn } from "@/lib/utils";

export interface CardProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Buttons or a link — keep to one primary action. */
  actions?: React.ReactNode;
  /** Divider-separated footer, for totals or a row of links. */
  footer?: React.ReactNode;
  children?: React.ReactNode;
  /** Drop the body padding for edge-to-edge content such as a table. */
  flush?: boolean;
  className?: string;
}

export default function Card({
  title,
  description,
  actions,
  footer,
  children,
  flush = false,
  className,
}: CardProps) {
  const hasHeader = Boolean(title || description || actions);

  return (
    <section
      className={cn(
        "flex flex-col overflow-hidden rounded-card border border-line bg-surface",
        className,
      )}
    >
      {hasHeader ? (
        <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
          <div className="min-w-0">
            {title ? <h3 className="truncate text-md text-ink">{title}</h3> : null}
            {description ? <p className="mt-0.5 text-sm text-ink-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}

      {children ? (
        <div className={cn(flush ? "" : "px-5 pb-5", hasHeader && "pt-0")}>{children}</div>
      ) : null}

      {footer ? (
        <footer className="border-t border-line-soft bg-surface-muted px-5 py-3 text-sm text-ink-body">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}
