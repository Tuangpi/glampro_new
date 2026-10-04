/**
 * The round initials chip on every customer row and in the form's header.
 *
 * Handoff screen 07 paints it 34px, `#E7F8EF` on `#1B8A57`, which is this repo's
 * `success-soft` / `success-text` pair. Decorative: the name is always rendered
 * next to it, so a screen reader gains nothing from announcing the initials.
 */
import { getInitials } from "@/lib/utils";

export interface CustomerAvatarProps {
  name: string;
  /** Grows the chip to the drawer's 56px header. */
  size?: "row" | "hero";
}

export default function CustomerAvatar({ name, size = "row" }: CustomerAvatarProps) {
  return (
    <span
      aria-hidden
      className={
        size === "hero"
          ? "flex size-14 shrink-0 items-center justify-center rounded-full bg-purple text-lg font-extrabold text-white"
          : "flex size-[34px] shrink-0 items-center justify-center rounded-full bg-success-soft text-xs font-extrabold text-success-text"
      }
    >
      {getInitials(name)}
    </span>
  );
}
