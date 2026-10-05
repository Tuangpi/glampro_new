/**
 * A stat tile — a count the server made, in a box with an icon.
 *
 * Presentational: a tile shows a number and never filters, which is how handoff
 * screens 08 and 09 both draw them. It was lifted out of `pages/Products.tsx` when the
 * staff screen drew the same tile; the *missing* tiles (the catalogue's Inventory
 * value, a staff member's shifts) are absent because there is no number to put in
 * them, which is a decision about the model rather than about this component.
 *
 * `undefined` renders as an em dash rather than `0`, so a tile that has not answered
 * yet cannot be read as "none".
 */
import { cn } from "@/lib/utils";

/**
 * The tone tints, taken from `Badge`'s own palette so a warning tile is the same
 * amber the warning badge is.
 */
const TILE_TONES = {
  purple: "bg-purple-soft text-purple",
  success: "bg-success-soft text-success-text",
  neutral: "bg-surface-2 text-ink-body",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger/10 text-danger",
} as const;

export interface StatTileProps {
  icon: React.ReactNode;
  value: number | undefined;
  label: string;
  tone?: keyof typeof TILE_TONES;
}

export default function StatTile({ icon, value, label, tone = "purple" }: StatTileProps) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-line bg-surface px-4.5 py-3.5">
      <span
        aria-hidden
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md",
          TILE_TONES[tone],
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-lg font-heavy leading-tight text-ink">{value ?? "—"}</p>
        <p className="text-xs text-ink-muted">{label}</p>
      </div>
    </div>
  );
}
