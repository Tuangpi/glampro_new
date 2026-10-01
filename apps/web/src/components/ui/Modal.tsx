/**
 * A centred dialog for a decision the user has to make before going on —
 * confirming a refund, choosing how to pay, discarding a draft.
 *
 * For anything the user can simply look at and dismiss, prefer an inline
 * `Card` or a `Drawer`: a modal interrupts, so it should be reserved for a
 * choice that matters. Focus, Escape and the backdrop all come from `Dialog`.
 */
import { cn } from "@/lib/utils";
import Dialog from "./Dialog";

export type ModalSize = "sm" | "md" | "lg";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: ModalSize;
  showClose?: boolean;
}

const SIZES: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  showClose = true,
}: ModalProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={footer}
      showClose={showClose}
      panelClassName={cn("w-full rounded-card", SIZES[size])}
    >
      {children}
    </Dialog>
  );
}
