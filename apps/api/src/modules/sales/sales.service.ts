import type {
  CreateSaleRefundRequest,
  CreateSaleRequest,
  SaleLineRequest,
  SaleQuery,
  SaleStatus,
  SaleSummary,
} from '@glampro/contracts';
import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { type AuditContext, recordAuditEvent } from '../../shared/audit.js';
import { AppError } from '../../shared/http/app-error.js';
import { scopedCustomerRow } from '../appointments/appointments.common.js';
import { productSelection, serviceSelection } from '../catalog/catalog.service.js';
import { scopedStaffRow } from '../staff/staff.common.js';
import { saleSelection, scopedSaleLocation, scopedSaleRow, toSale } from './sales.common.js';

type CatalogService = {
  id: string;
  name: string;
  priceInCents: number;
  isAvailable: boolean;
};

type CatalogProduct = {
  id: string;
  name: string;
  priceInCents: number;
  trackInventory: boolean;
  isAvailable: boolean;
};

type PreparedLine =
  | {
      type: 'SERVICE';
      item: CatalogService;
      quantity: number;
      staffProfileId: string | null;
      discountInCents: number;
      totalInCents: number;
    }
  | {
      type: 'PRODUCT';
      item: CatalogProduct;
      quantity: number;
      discountInCents: number;
      totalInCents: number;
    };

const receiptCodeOf = (prefix: string, receiptNumber: number) =>
  `${prefix}-${String(receiptNumber).padStart(6, '0')}`;

const assertPositivePaymentTotal = (totalInCents: number, paidInCents: number) => {
  if (paidInCents !== totalInCents) {
    throw new AppError(
      422,
      'VALIDATION_ERROR',
      `Payments must add up to the sale total of ${totalInCents} cents`,
      { expectedInCents: totalInCents, receivedInCents: paidInCents },
    );
  }
};

const assertDiscount = (grossInCents: number, discountInCents: number, name: string) => {
  if (discountInCents > grossInCents) {
    throw new AppError(422, 'VALIDATION_ERROR', `The discount for “${name}” is too large`);
  }
};

const loadCatalog = async (organizationId: string, lines: readonly SaleLineRequest[]) => {
  const serviceIds = lines.flatMap((line) => (line.type === 'SERVICE' ? [line.serviceId] : []));
  const productIds = lines.flatMap((line) => (line.type === 'PRODUCT' ? [line.productId] : []));

  const [services, products] = await Promise.all([
    prisma.service.findMany({
      where: { organizationId, id: { in: [...new Set(serviceIds)] } },
      select: serviceSelection,
    }),
    prisma.product.findMany({
      where: { organizationId, id: { in: [...new Set(productIds)] } },
      select: productSelection,
    }),
  ]);

  return {
    servicesById: new Map(services.map((service) => [service.id, service])),
    productsById: new Map(products.map((product) => [product.id, product])),
  };
};

const assertStaffCanPerform = async (
  organizationId: string,
  staffProfileId: string,
  serviceIds: readonly string[],
) => {
  const staff = await scopedStaffRow(organizationId, staffProfileId);
  if (!staff.isActive) {
    throw new AppError(409, 'CONFLICT', 'That staff member is no longer active');
  }

  const assignments = await prisma.staffServiceAssignment.findMany({
    where: { organizationId, staffProfileId },
    select: { serviceId: true },
  });

  if (
    assignments.length > 0 &&
    serviceIds.some((id) => !assignments.some((row) => row.serviceId === id))
  ) {
    throw new AppError(
      409,
      'CONFLICT',
      'That staff member does not perform every selected service',
    );
  }
};

const prepareLines = async (organizationId: string, lines: readonly SaleLineRequest[]) => {
  const { servicesById, productsById } = await loadCatalog(organizationId, lines);
  const staffServiceIds = new Map<string, string[]>();
  const prepared: PreparedLine[] = [];

  for (const line of lines) {
    if (line.type === 'SERVICE') {
      const item = servicesById.get(line.serviceId);
      if (!item) throw new AppError(404, 'NOT_FOUND', 'Service was not found');
      if (!item.isAvailable) throw new AppError(409, 'CONFLICT', `“${item.name}” is not available`);
      const staffProfileId = line.staffProfileId ?? null;
      if (staffProfileId) {
        const ids = staffServiceIds.get(staffProfileId) ?? [];
        ids.push(item.id);
        staffServiceIds.set(staffProfileId, ids);
      }
      const gross = item.priceInCents * line.quantity;
      assertDiscount(gross, line.discountInCents, item.name);
      prepared.push({
        type: 'SERVICE',
        item,
        quantity: line.quantity,
        staffProfileId,
        discountInCents: line.discountInCents,
        totalInCents: gross - line.discountInCents,
      });
      continue;
    }

    const item = productsById.get(line.productId);
    if (!item) throw new AppError(404, 'NOT_FOUND', 'Product was not found');
    if (!item.isAvailable) throw new AppError(409, 'CONFLICT', `“${item.name}” is not available`);
    const gross = item.priceInCents * line.quantity;
    assertDiscount(gross, line.discountInCents, item.name);
    prepared.push({
      type: 'PRODUCT',
      item,
      quantity: line.quantity,
      discountInCents: line.discountInCents,
      totalInCents: gross - line.discountInCents,
    });
  }

  for (const [staffProfileId, serviceIds] of staffServiceIds) {
    await assertStaffCanPerform(organizationId, staffProfileId, serviceIds);
  }

  return prepared;
};

const validateAppointment = async (
  organizationId: string,
  appointmentId: string | null | undefined,
  locationId: string,
  customerId: string | null | undefined,
) => {
  if (!appointmentId) return;

  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, organizationId },
    select: { id: true, locationId: true, customerId: true },
  });

  if (!appointment) throw new AppError(404, 'NOT_FOUND', 'Appointment was not found');
  if (appointment.locationId !== locationId) {
    throw new AppError(409, 'CONFLICT', 'The appointment belongs to another location');
  }
  if (customerId && appointment.customerId !== customerId) {
    throw new AppError(409, 'CONFLICT', 'The appointment belongs to another customer');
  }
};

export const listSales = async (
  organizationId: string,
  query: SaleQuery,
): Promise<SaleSummary[]> => {
  const sales = await prisma.sale.findMany({
    where: {
      organizationId,
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lt: new Date(query.to) } : {}),
            },
          }
        : {}),
    },
    select: saleSelection,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit,
  });

  return sales.map(toSale);
};

export const saleDetailOf = async (organizationId: string, saleId: string) =>
  toSale(await scopedSaleRow(organizationId, saleId));

export const createSale = async (
  organizationId: string,
  input: CreateSaleRequest,
  actorUserId: string,
  context: AuditContext,
): Promise<SaleSummary> => {
  const location = await scopedSaleLocation(organizationId, input.locationId);
  if (input.customerId) await scopedCustomerRow(organizationId, input.customerId);
  await validateAppointment(
    organizationId,
    input.appointmentId,
    input.locationId,
    input.customerId,
  );

  const prepared = await prepareLines(organizationId, input.lines);
  const subtotalInCents = prepared.reduce(
    (total, line) => total + line.item.priceInCents * line.quantity,
    0,
  );
  const discountInCents = prepared.reduce((total, line) => total + line.discountInCents, 0);
  const totalInCents = prepared.reduce((total, line) => total + line.totalInCents, 0);
  const paidInCents = input.payments.reduce((total, payment) => total + payment.amountInCents, 0);
  assertPositivePaymentTotal(totalInCents, paidInCents);

  const created = await prisma.$transaction(async (transaction) => {
    const counter = await transaction.location.update({
      where: { id: location.id },
      data: { nextReceiptNumber: { increment: 1 } },
      select: { nextReceiptNumber: true, receiptPrefix: true },
    });
    const receiptNumber = counter.nextReceiptNumber - 1;
    const receiptCode = receiptCodeOf(counter.receiptPrefix, receiptNumber);

    const sale = await transaction.sale.create({
      data: {
        organizationId,
        locationId: location.id,
        receiptNumber,
        receiptCode,
        customerId: input.customerId ?? null,
        appointmentId: input.appointmentId ?? null,
        subtotalInCents,
        discountInCents,
        taxInCents: 0,
        totalInCents,
        paidInCents,
        notes: input.notes ?? null,
        createdById: actorUserId,
      },
      select: { id: true },
    });

    for (const line of prepared) {
      const saleLine = await transaction.saleLine.create({
        data: {
          organizationId,
          saleId: sale.id,
          type: line.type,
          serviceId: line.type === 'SERVICE' ? line.item.id : null,
          productId: line.type === 'PRODUCT' ? line.item.id : null,
          staffProfileId: line.type === 'SERVICE' ? line.staffProfileId : null,
          name: line.item.name,
          quantity: line.quantity,
          unitPriceInCents: line.item.priceInCents,
          discountInCents: line.discountInCents,
          taxInCents: 0,
          totalInCents: line.totalInCents,
          inventoryTracked: line.type === 'PRODUCT' ? line.item.trackInventory : false,
        },
        select: { id: true },
      });

      if (line.type === 'PRODUCT' && line.item.trackInventory) {
        const stock = await transaction.inventoryLevel.updateMany({
          where: {
            organizationId,
            productId: line.item.id,
            locationId: location.id,
            quantityOnHand: { gte: line.quantity },
          },
          data: { quantityOnHand: { decrement: line.quantity } },
        });

        if (stock.count !== 1) {
          throw new AppError(409, 'CONFLICT', `“${line.item.name}” does not have enough stock`);
        }

        await transaction.inventoryMovement.create({
          data: {
            organizationId,
            productId: line.item.id,
            locationId: location.id,
            movementType: 'SALE',
            quantity: line.quantity,
            reason: `Sale ${receiptCode}`,
            performedById: actorUserId,
            saleId: sale.id,
            saleLineId: saleLine.id,
          },
        });
      }
    }

    await transaction.salePayment.createMany({
      data: input.payments.map((payment) => ({
        organizationId,
        saleId: sale.id,
        method: payment.method,
        amountInCents: payment.amountInCents,
        reference: payment.reference ?? null,
      })),
    });

    return transaction.sale.findUniqueOrThrow({
      where: { id: sale.id },
      select: saleSelection,
    });
  });

  await recordAuditEvent(context, {
    action: 'sale.created',
    actorType: 'USER',
    organizationId,
    actorUserId,
    entityType: 'Sale',
    entityId: created.id,
    metadata: {
      receiptCode: created.receiptCode,
      totalInCents: created.totalInCents,
      lineCount: created.lines.length,
    },
  });

  return toSale(created);
};

type SaleStockLine = {
  id: string;
  productId: string | null;
  inventoryTracked: boolean;
  quantity: number;
};

const returnProductStock = async (
  transaction: Prisma.TransactionClient,
  organizationId: string,
  locationId: string,
  saleId: string,
  line: SaleStockLine,
  actorUserId: string,
  reason: string,
) => {
  if (!line.inventoryTracked || !line.productId) return;

  await transaction.inventoryLevel.upsert({
    where: {
      organizationId_productId_locationId: {
        organizationId,
        productId: line.productId,
        locationId,
      },
    },
    create: {
      organizationId,
      productId: line.productId,
      locationId,
      quantityOnHand: line.quantity,
    },
    update: { quantityOnHand: { increment: line.quantity } },
  });

  await transaction.inventoryMovement.create({
    data: {
      organizationId,
      productId: line.productId,
      locationId,
      movementType: 'RETURN',
      quantity: line.quantity,
      reason,
      performedById: actorUserId,
      saleId,
      saleLineId: line.id,
    },
  });
};

export const voidSale = async (
  organizationId: string,
  saleId: string,
  reason: string,
  actorUserId: string,
  context: AuditContext,
): Promise<SaleSummary> => {
  const existing = await scopedSaleRow(organizationId, saleId);
  if (existing.status !== 'COMPLETED') {
    throw new AppError(409, 'CONFLICT', 'Only a completed sale can be voided');
  }

  const updated = await prisma.$transaction(async (transaction) => {
    for (const line of existing.lines) {
      await returnProductStock(
        transaction,
        organizationId,
        existing.locationId,
        existing.id,
        line,
        actorUserId,
        `Void ${existing.receiptCode}`,
      );
    }

    return transaction.sale.update({
      where: { id: existing.id },
      data: {
        status: 'VOIDED',
        voidedAt: new Date(),
        voidReason: reason,
        voidedById: actorUserId,
      },
      select: saleSelection,
    });
  });

  await recordAuditEvent(context, {
    action: 'sale.voided',
    actorType: 'USER',
    organizationId,
    actorUserId,
    entityType: 'Sale',
    entityId: existing.id,
    metadata: { receiptCode: existing.receiptCode, reason },
  });

  return toSale(updated);
};

const remainingRefundable = (sale: { totalInCents: number; refundedInCents: number }) =>
  sale.totalInCents - sale.refundedInCents;

export const refundSale = async (
  organizationId: string,
  saleId: string,
  input: CreateSaleRefundRequest,
  actorUserId: string,
  context: AuditContext,
): Promise<SaleSummary> => {
  const existing = await scopedSaleRow(organizationId, saleId);
  if (existing.status === 'VOIDED' || existing.status === 'REFUNDED') {
    throw new AppError(409, 'CONFLICT', 'This sale cannot be refunded');
  }

  const remaining = remainingRefundable(existing);
  if (input.amountInCents > remaining) {
    throw new AppError(409, 'CONFLICT', 'The refund is larger than the remaining sale total');
  }

  const returnedByLine = new Map<string, number>();
  for (const refund of existing.refunds) {
    for (const line of refund.lines) {
      returnedByLine.set(
        line.saleLineId,
        (returnedByLine.get(line.saleLineId) ?? 0) + line.quantity,
      );
    }
  }

  const requestedReturns = new Map<string, number>();
  for (const returned of input.returns) {
    requestedReturns.set(
      returned.lineId,
      (requestedReturns.get(returned.lineId) ?? 0) + returned.quantity,
    );
  }

  // A full refund with no explicit return list returns every remaining tracked product.
  if (requestedReturns.size === 0 && input.amountInCents === remaining) {
    for (const line of existing.lines) {
      if (line.type !== 'PRODUCT') continue;
      const quantity = line.quantity - (returnedByLine.get(line.id) ?? 0);
      if (quantity > 0) requestedReturns.set(line.id, quantity);
    }
  }

  for (const [lineId, quantity] of requestedReturns) {
    const line = existing.lines.find((candidate) => candidate.id === lineId);
    if (!line || line.type !== 'PRODUCT') {
      throw new AppError(409, 'CONFLICT', 'Only product lines can be returned');
    }
    if (quantity + (returnedByLine.get(lineId) ?? 0) > line.quantity) {
      throw new AppError(409, 'CONFLICT', 'The returned quantity exceeds the sold quantity');
    }
  }

  const updated = await prisma.$transaction(async (transaction) => {
    const refund = await transaction.saleRefund.create({
      data: {
        organizationId,
        saleId: existing.id,
        amountInCents: input.amountInCents,
        method: input.method,
        reason: input.reason,
        reference: input.reference ?? null,
        processedById: actorUserId,
      },
      select: { id: true },
    });

    for (const [lineId, quantity] of requestedReturns) {
      const line = existing.lines.find((candidate) => candidate.id === lineId);
      if (!line) throw new AppError(404, 'NOT_FOUND', 'Sale line was not found');
      await transaction.saleRefundLine.create({
        data: { organizationId, refundId: refund.id, saleLineId: lineId, quantity },
      });
      await returnProductStock(
        transaction,
        organizationId,
        existing.locationId,
        existing.id,
        { ...line, quantity },
        actorUserId,
        `Refund ${existing.receiptCode}`,
      );
    }

    const refundedInCents = existing.refundedInCents + input.amountInCents;
    const status: SaleStatus =
      refundedInCents === existing.totalInCents ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    await transaction.sale.update({
      where: { id: existing.id },
      data: { refundedInCents, status },
    });

    return transaction.sale.findUniqueOrThrow({
      where: { id: existing.id },
      select: saleSelection,
    });
  });

  await recordAuditEvent(context, {
    action: 'sale.refunded',
    actorType: 'USER',
    organizationId,
    actorUserId,
    entityType: 'SaleRefund',
    entityId: updated.refunds.at(-1)?.id ?? updated.id,
    metadata: {
      saleId: existing.id,
      amountInCents: input.amountInCents,
      method: input.method,
      returnedLineCount: requestedReturns.size,
    },
  });

  return toSale(updated);
};
