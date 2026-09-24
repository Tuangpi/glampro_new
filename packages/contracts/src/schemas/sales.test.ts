import { describe, expect, it } from 'vitest';
import {
  createSaleRefundRequestSchema,
  createSaleRequestSchema,
  saleQuerySchema,
  saleSummarySchema,
} from './sales.js';

const now = '2026-09-24T08:00:00.000Z';

const sale = {
  id: 'sale_1',
  organizationId: 'org_1',
  locationId: 'loc_1',
  receiptNumber: 1,
  receiptCode: 'SALE-000001',
  customerId: null,
  appointmentId: null,
  status: 'COMPLETED',
  subtotalInCents: 6300,
  discountInCents: 0,
  taxInCents: 0,
  totalInCents: 6300,
  paidInCents: 6300,
  refundedInCents: 0,
  notes: null,
  createdById: 'user_1',
  createdBy: { id: 'user_1', firstName: 'Kai', lastName: 'Tan', email: 'kai@test' },
  voidedAt: null,
  voidReason: null,
  createdAt: now,
  updatedAt: now,
  customer: null,
  location: {
    id: 'loc_1',
    organizationId: 'org_1',
    name: 'Tanjong Pagar',
    code: 'TPG',
    timezone: 'Asia/Singapore',
    currency: 'SGD',
    isActive: true,
  },
  lines: [
    {
      id: 'line_1',
      type: 'SERVICE',
      serviceId: 'service_1',
      productId: null,
      staffProfileId: null,
      staff: null,
      name: 'Women’s cut',
      quantity: 1,
      unitPriceInCents: 4500,
      discountInCents: 0,
      taxInCents: 0,
      totalInCents: 4500,
      inventoryTracked: false,
    },
  ],
  payments: [
    {
      id: 'payment_1',
      method: 'CASH',
      amountInCents: 6300,
      reference: null,
      createdAt: now,
    },
  ],
  refunds: [],
};

describe('point-of-sale contracts', () => {
  it('normalizes a mixed cart and split payments', () => {
    const parsed = createSaleRequestSchema.parse({
      locationId: 'loc_1',
      lines: [
        { type: 'SERVICE', serviceId: 'service_1' },
        { type: 'PRODUCT', productId: 'product_1', quantity: 2 },
      ],
      payments: [
        { method: 'CASH', amountInCents: 5000 },
        { method: 'PAYNOW', amountInCents: 1300, reference: 'qr-1' },
      ],
    });

    expect(parsed.lines[0]).toMatchObject({ type: 'SERVICE', quantity: 1, discountInCents: 0 });
    expect(parsed.lines[1]).toMatchObject({ type: 'PRODUCT', quantity: 2 });
  });

  it('rejects empty carts, invalid quantities, and unsupported payment methods', () => {
    expect(() =>
      createSaleRequestSchema.parse({
        locationId: 'loc_1',
        lines: [],
        payments: [{ method: 'CASH', amountInCents: 100 }],
      }),
    ).toThrow();
    expect(() =>
      createSaleRequestSchema.parse({
        locationId: 'loc_1',
        lines: [{ type: 'PRODUCT', productId: 'product_1', quantity: 0 }],
        payments: [{ method: 'CASH', amountInCents: 100 }],
      }),
    ).toThrow();
    expect(() =>
      createSaleRequestSchema.parse({
        locationId: 'loc_1',
        lines: [{ type: 'PRODUCT', productId: 'product_1' }],
        payments: [{ method: 'CRYPTO', amountInCents: 100 }],
      }),
    ).toThrow();
  });

  it('validates list, void, and refund inputs', () => {
    expect(saleQuerySchema.parse({ limit: '25' }).limit).toBe(25);
    expect(() => saleQuerySchema.parse({ limit: '0' })).toThrow();
    expect(
      createSaleRefundRequestSchema.parse({ amountInCents: 100, method: 'CASH', reason: 'Return' }),
    ).toMatchObject({
      returns: [],
    });
  });

  it('parses the full sale and receipt shape', () => {
    const parsed = saleSummarySchema.parse(sale);
    expect(parsed.receiptCode).toBe('SALE-000001');
    expect(parsed.lines[0]!.name).toBe('Women’s cut');
    expect(parsed.payments[0]!.amountInCents).toBe(6300);
  });
});
