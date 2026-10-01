/**
 * A panel that slides in from the side, for a record the user is working
 * beside the list rather than instead of it.
 *
 * Same dialog behaviour as `Modal` — focus moves in, Tab stays inside, Escape
 * closes, focus returns to the opener. It is a drawer rather than a modal
 * because the list behind it stays useful: the screen keeps its context, which
 * is the whole reason to prefer this over `Modal`.
 */
import { cn } from "@/lib/utils";
import Dialog from "./Dialog";

export type DrawerSide = "left" | "right";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  side?: DrawerSide;
  /** Width of the panel. The handoff has no token for this, so it is a utility. */
  widthClassName?: string;
}

export default function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  side = "right",
  widthClassName = "max-w-md",
}: DrawerProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={footer}
      containerClassName={cn("p-0", side === "right" ? "justify-end" : "justify-start")}
      panelClassName={cn("h-full w-full", widthClassName)}
    >
      {children}
    </Dialog>
  );
}
