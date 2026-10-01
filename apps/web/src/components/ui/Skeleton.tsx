/**
 * A loading placeholder shaped like the content it stands in for.
 *
 * It is decorative and always `aria-hidden`, so a screen reader is not read a
 * row of empty boxes. The loading state belongs on the container: give it
 * `aria-busy="true"` and a label, e.g.
 *
 * ```tsx
 * <div aria-busy="true" aria-label="Loading customers">
 *   <Skeleton />
 * </div>
 * ```
 *
 * Size comes from `className` rather than width/height props so a caller never
 * has to invent a pixel value; the default is a single text line.
 */
import { cn } from "@/lib/utils";

export interface SkeletonProps {
  className?: string;
}

export default function Skeleton({ className }: SkeletonProps) {
  return <div aria-hidden className={cn("h-4 w-full rounded-sm bg-surface-2", className)} />;
}
