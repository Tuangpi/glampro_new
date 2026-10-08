/**
 * Sale vocabulary — the words for the till's category tabs and tenders.
 *
 * One place for both, for the same reason `constants/staff.ts` holds the role
 * labels: the item grid, the cart and the receipt must not each invent their own
 * label for `VALUE_PACKAGE`. The lists are derived from the contract's own
 * constants (`SALE_ITEM_KINDS`, `PAYMENT_METHODS`) rather than re-typed, so a
 * code added to the contract is a TypeScript error here instead of a tab nobody
 * can name.
 */
import type { BadgeVariant } from "@/components/ui/Badge";
import {
  PAYMENT_METHODS,
  SALE_ITEM_KINDS,
  type SaleItemKind,
  type SalePaymentMethod,
} from "@glampro/shared";

export const SALE_KIND_LABELS: Record<SaleItemKind, string> = {
  SERVICE: "Services",
  PRODUCT: "Products",
  PACKAGE: "Packages",
  VALUE_PACKAGE: "Value packages",
  GIFT_CARD: "Gift cards",
};

/** The tab row's order, which is the contract's own order (SALE_ITEM_KINDS). */
export const SALE_KIND_TABS = SALE_ITEM_KINDS.map((kind) => ({
  value: kind,
  label: SALE_KIND_LABELS[kind],
}));

export const PAYMENT_METHOD_LABELS: Record<SalePaymentMethod, string> = {
  CASH: "Cash",
  CARD: "Card",
  BANK_TRANSFER: "Bank transfer",
  CHEQUE: "Cheque",
  OTHER: "Other",
};

/** For the tender `<Select>`; the five tenders in the contract's own order. */
export const PAYMENT_METHOD_OPTIONS = PAYMENT_METHODS.map((method) => ({
  value: method,
  label: PAYMENT_METHOD_LABELS[method],
}));

/**
 * Tender-to-tone for the receipt. Cash and card are the common pair and read
 * purple; bank, cheque and other are the rare ones and read neutral. The colour
 * repeats what the label already says rather than carrying the meaning, which
 * is why every badge also renders its own text.
 */
export const PAYMENT_METHOD_BADGE: Record<SalePaymentMethod, BadgeVariant> = {
  CASH: "purple",
  CARD: "purple",
  BANK_TRANSFER: "neutral",
  CHEQUE: "neutral",
  OTHER: "neutral",
};
