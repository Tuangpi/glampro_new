/**
 * What a list or a search shows when it has nothing to show.
 *
 * An empty state is a sentence about the user's situation, not a shrug, so the
 * description says what would put rows here. The optional action is the way
 * out of it — a single primary action, never two.
 */
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  title: string;
  /** Say what would fill this space. */
  description?: React.ReactNode;
  /** Decorative — the title already names the state. */
  icon?: React.ReactNode;
  /** One primary way forward. */
  action?: React.ReactNode;
  className?: string;
}

export default function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-14 text-center",
        className,
      )}
    >
      {icon ? (
        <span aria-hidden className="rounded-pill bg-purple-soft p-3 text-xl text-purple">
          {icon}
        </span>
      ) : null}

      <div className="max-w-sm">
        <p className="text-md font-medium text-ink">{title}</p>
        {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      </div>

      {action}
    </div>
  );
}
