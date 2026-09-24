import type { PaymentMethod, ProductSummary, SaleStatus, ServiceSummary } from '@glampro/contracts';

export type CartLine =
  | {
      type: 'SERVICE';
      item: ServiceSummary;
      quantity: number;
      staffProfileId: string | null;
    }
  | {
      type: 'PRODUCT';
      item: ProductSummary;
      quantity: number;
    };

export type CartTotals = {
  subtotalInCents: number;
  totalInCents: number;
};

export const cartTotals = (lines: readonly CartLine[]): CartTotals => ({
  subtotalInCents: lines.reduce((total, line) => total + line.item.priceInCents * line.quantity, 0),
  totalInCents: lines.reduce((total, line) => total + line.item.priceInCents * line.quantity, 0),
});

export const saleStatusLabels: Record<SaleStatus, string> = {
  COMPLETED: 'Completed',
  VOIDED: 'Voided',
  PARTIALLY_REFUNDED: 'Partially refunded',
  REFUNDED: 'Refunded',
};

export const saleStatusTone: Record<SaleStatus, string> = {
  COMPLETED: 'bg-[#E7F7EE] text-[#1C8A5A]',
  VOIDED: 'bg-[#FDECEC] text-[#B42318]',
  PARTIALLY_REFUNDED: 'bg-[#FFF4DE] text-[#8A5B00]',
  REFUNDED: 'bg-[#EEF1FF] text-[#2B3160]',
};

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  PAYNOW: 'PayNow',
  CARD: 'Card',
  OTHER: 'Other',
};

export const displayStaffName = (staff: {
  displayName: string | null;
  member: { firstName: string; lastName: string | null };
}) =>
  staff.displayName?.trim() ||
  [staff.member.firstName, staff.member.lastName].filter(Boolean).join(' ');

export const toCents = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
};

export const fromCents = (value: number) => (value / 100).toFixed(2);
