import type {
  SaleLineSummary,
  SalePaymentSummary,
  SaleRefundSummary,
  SaleSummary,
} from '@glampro/contracts';
import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { customerSelection, toCustomer } from '../customers/customers.service.js';
import { staffSelection, toStaffProfile } from '../staff/staff.common.js';
import { AppError } from '../../shared/http/app-error.js';

const actorSelection = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

const locationSelection = {
  id: true,
  organizationId: true,
  name: true,
  code: true,
  timezone: true,
  currency: true,
  isActive: true,
} as const;

const lineSelection = {
  id: true,
  type: true,
  serviceId: true,
  productId: true,
  staffProfileId: true,
  name: true,
  quantity: true,
  unitPriceInCents: true,
  discountInCents: true,
  taxInCents: true,
  totalInCents: true,
  inventoryTracked: true,
  staffProfile: { select: staffSelection },
} as const;

const paymentSelection = {
  id: true,
  method: true,
  amountInCents: true,
  reference: true,
  createdAt: true,
} as const;

const refundLineSelection = {
  id: true,
  saleLineId: true,
  quantity: true,
} as const;

const refundSelection = {
  id: true,
  amountInCents: true,
  method: true,
  reason: true,
  reference: true,
  processedById: true,
  processedBy: { select: actorSelection },
  createdAt: true,
  lines: { select: refundLineSelection },
} as const;

export const saleSelection = {
  id: true,
  organizationId: true,
  locationId: true,
  receiptNumber: true,
  receiptCode: true,
  customerId: true,
  appointmentId: true,
  status: true,
  subtotalInCents: true,
  discountInCents: true,
  taxInCents: true,
  totalInCents: true,
  paidInCents: true,
  refundedInCents: true,
  notes: true,
  createdById: true,
  createdBy: { select: actorSelection },
  voidedAt: true,
  voidReason: true,
  voidedById: true,
  voidedBy: { select: actorSelection },
  createdAt: true,
  updatedAt: true,
  customer: { select: customerSelection },
  location: { select: locationSelection },
  lines: { select: lineSelection, orderBy: { createdAt: 'asc' } },
  payments: { select: paymentSelection, orderBy: { createdAt: 'asc' } },
  refunds: { select: refundSelection, orderBy: { createdAt: 'asc' } },
} as const;

type SaleRow = Prisma.SaleGetPayload<{ select: typeof saleSelection }>;
type SaleLineRow = SaleRow['lines'][number];
type SaleRefundRow = SaleRow['refunds'][number];
const toActor = (actor: SaleRow['createdBy']) => actor;

const toLine = (row: SaleLineRow): SaleLineSummary => ({
  id: row.id,
  type: row.type,
  serviceId: row.serviceId,
  productId: row.productId,
  staffProfileId: row.staffProfileId,
  staff: row.staffProfile ? toStaffProfile(row.staffProfile) : null,
  name: row.name,
  quantity: row.quantity,
  unitPriceInCents: row.unitPriceInCents,
  discountInCents: row.discountInCents,
  taxInCents: row.taxInCents,
  totalInCents: row.totalInCents,
  inventoryTracked: row.inventoryTracked,
});

const toPayment = (row: SaleRow['payments'][number]): SalePaymentSummary => ({
  id: row.id,
  method: row.method,
  amountInCents: row.amountInCents,
  reference: row.reference,
  createdAt: row.createdAt.toISOString(),
});

const toRefund = (row: SaleRefundRow): SaleRefundSummary => ({
  id: row.id,
  amountInCents: row.amountInCents,
  method: row.method,
  reason: row.reason,
  reference: row.reference,
  processedById: row.processedById,
  processedBy: toActor(row.processedBy),
  createdAt: row.createdAt.toISOString(),
  lines: row.lines.map((line) => ({
    id: line.id,
    saleLineId: line.saleLineId,
    quantity: line.quantity,
  })),
});

export const toSale = (row: SaleRow): SaleSummary => ({
  id: row.id,
  organizationId: row.organizationId,
  locationId: row.locationId,
  receiptNumber: row.receiptNumber,
  receiptCode: row.receiptCode,
  customerId: row.customerId,
  appointmentId: row.appointmentId,
  status: row.status,
  subtotalInCents: row.subtotalInCents,
  discountInCents: row.discountInCents,
  taxInCents: row.taxInCents,
  totalInCents: row.totalInCents,
  paidInCents: row.paidInCents,
  refundedInCents: row.refundedInCents,
  notes: row.notes,
  createdById: row.createdById,
  createdBy: toActor(row.createdBy),
  voidedAt: row.voidedAt?.toISOString() ?? null,
  voidReason: row.voidReason,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  customer: row.customer ? toCustomer(row.customer) : null,
  location: row.location,
  lines: row.lines.map(toLine),
  payments: row.payments.map(toPayment),
  refunds: row.refunds.map(toRefund),
});

export const scopedSaleRow = async (organizationId: string, saleId: string): Promise<SaleRow> => {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, organizationId },
    select: saleSelection,
  });

  if (!sale) {
    throw new AppError(404, 'NOT_FOUND', 'Sale was not found');
  }

  return sale;
};

export const scopedSaleLocation = async (organizationId: string, locationId: string) => {
  const location = await prisma.location.findFirst({
    where: { id: locationId, organizationId, isActive: true },
    select: {
      ...locationSelection,
      receiptPrefix: true,
      nextReceiptNumber: true,
      pricesIncludeTax: true,
    },
  });

  if (!location) {
    throw new AppError(404, 'NOT_FOUND', 'Location was not found');
  }

  return location;
};
