import { describe, expect, it } from 'vitest';
import type { ProductSummary, ServiceSummary } from '@glampro/contracts';
import { cartTotals, fromCents, saleStatusLabels, toCents } from './saleView';

const service = {
  id: 'service_1',
  organizationId: 'org_1',
  serviceCategoryId: 'category_1',
  name: 'Cut',
  description: null,
  durationMinutes: 45,
  priceInCents: 4500,
  sortOrder: 0,
  isAvailable: true,
  createdAt: '2026-09-24T08:00:00.000Z',
  updatedAt: '2026-09-24T08:00:00.000Z',
} satisfies ServiceSummary;

const product = {
  id: 'product_1',
  organizationId: 'org_1',
  productCategoryId: 'category_1',
  name: 'Shampoo',
  description: null,
  sku: null,
  priceInCents: 1800,
  costInCents: null,
  trackInventory: true,
  isAvailable: true,
  createdAt: '2026-09-24T08:00:00.000Z',
  updatedAt: '2026-09-24T08:00:00.000Z',
} satisfies ProductSummary;

describe('sales view helpers', () => {
  it('calculates a mixed cart total', () => {
    expect(
      cartTotals([
        { type: 'SERVICE', item: service, quantity: 1, staffProfileId: null },
        { type: 'PRODUCT', item: product, quantity: 2 },
      ]),
    ).toEqual({ subtotalInCents: 8100, totalInCents: 8100 });
  });

  it('converts entered dollars to integer cents without floating point money', () => {
    expect(toCents('18.50')).toBe(1850);
    expect(fromCents(1850)).toBe('18.50');
    expect(toCents('not money')).toBe(0);
  });

  it('has a label for every sale status', () => {
    expect(saleStatusLabels.PARTIALLY_REFUNDED).toBe('Partially refunded');
    expect(saleStatusLabels.REFUNDED).toBe('Refunded');
  });
});
