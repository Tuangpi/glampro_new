/**
 * A data table driven by column definitions rather than by hand-written markup,
 * so every list screen gets the same header, row, hover and alignment rules.
 *
 * The caption is required and is visually hidden: it is what a screen reader
 * reads out when it reaches the table, so a table without one is announced as
 * a bare grid. Use `Card`'s title for the visible heading.
 *
 * When there are no rows, `empty` replaces the table entirely rather than
 * leaving an empty grid under a header — pass an `EmptyState`.
 */
import { cn } from "@/lib/utils";

export interface TableColumn<T> {
  key: string;
  header: React.ReactNode;
  /** Money and counts read better right-aligned. */
  align?: "left" | "right";
  cell: (row: T) => React.ReactNode;
}

export interface TableProps<T> {
  caption: string;
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Shown in place of the table when there are no rows. */
  empty?: React.ReactNode;
  /** Totals row, rendered in `tfoot`. */
  footer?: React.ReactNode;
  className?: string;
}

const ALIGN = { left: "text-left", right: "text-right" } as const;

export default function Table<T>({
  caption,
  columns,
  rows,
  rowKey,
  empty,
  footer,
  className,
}: TableProps<T>) {
  if (rows.length === 0 && empty) return <>{empty}</>;

  return (
    <div className={cn("overflow-x-auto rounded-card border border-line bg-surface", className)}>
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>

        <thead>
          <tr className="border-b border-line">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "px-4 py-3 text-xs font-medium tracking-wide text-ink-muted uppercase",
                  ALIGN[column.align ?? "left"],
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-b border-line-soft transition-colors last:border-0 hover:bg-surface-muted"
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn("px-4 py-3 text-ink-body", ALIGN[column.align ?? "left"])}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>

        {footer ? (
          <tfoot className="border-t border-line bg-surface-muted text-ink">{footer}</tfoot>
        ) : null}
      </table>
    </div>
  );
}
