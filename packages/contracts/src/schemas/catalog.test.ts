import { describe, expect, it } from 'vitest';
import {
  serviceCategoryRequestSchema,
  updateServiceCategoryRequestSchema,
  productCategoryRequestSchema,
  updateProductCategoryRequestSchema,
  createServiceRequestSchema,
  updateServiceRequestSchema,
  createProductRequestSchema,
  updateProductRequestSchema,
  createInventoryMovementRequestSchema,
  inventoryMovementTypeSchema,
  serviceCategorySummarySchema,
  productCategorySummarySchema,
  serviceSummarySchema,
  productSummarySchema,
  inventoryLevelSummarySchema,
  inventoryMovementSummarySchema,
} from './tenancy.js';

describe('catalog and inventory contracts', () => {
  it('accepts and normalizes category names', () => {
    expect(serviceCategoryRequestSchema.parse({ name: '  Cuts  ' }).name).toBe('Cuts');
    expect(productCategoryRequestSchema.parse({ name: 'Retail' }).name).toBe('Retail');
  });

  it('rejects empty category bodies', () => {
    expect(() => updateServiceCategoryRequestSchema.parse({})).toThrow();
    expect(() => updateProductCategoryRequestSchema.parse({})).toThrow();
  });

  it('enforces service request requirements', () => {
    const valid = createServiceRequestSchema.parse({
      serviceCategoryId: 'cat_1',
      name: 'Women’s cut',
      durationMinutes: 45,
      priceInCents: 4500,
    });

    expect(valid.serviceCategoryId).toBe('cat_1');
    expect(valid.name).toBe('Women’s cut');
    expect(valid.durationMinutes).toBe(45);
    expect(valid.priceInCents).toBe(4500);
    expect(valid.isAvailable).toBe(true);
  });

  it('rejects services without a category, name, duration, or price', () => {
    expect(() => createServiceRequestSchema.parse({})).toThrow();
    expect(() => createServiceRequestSchema.parse({ serviceCategoryId: 'x' })).toThrow();
    expect(() => createServiceRequestSchema.parse({ serviceCategoryId: 'x', name: 'X' })).toThrow();
    expect(() =>
      createServiceRequestSchema.parse({ serviceCategoryId: 'x', name: 'X', durationMinutes: 0 }),
    ).toThrow();
  });

  it('rejects service updates with no fields', () => {
    expect(() => updateServiceRequestSchema.parse({})).toThrow();
    expect(updateServiceRequestSchema.parse({ isAvailable: false }).isAvailable).toBe(false);
  });

  it('enforces product request requirements and optional SKU', () => {
    const withSku = createProductRequestSchema.parse({
      productCategoryId: 'cat_1',
      name: 'Shampoo 1L',
      priceInCents: 1800,
      trackInventory: true,
      sku: 'SHMP-001',
    });

    expect(withSku.sku).toBe('SHMP-001');
    expect(withSku.costInCents).toBeUndefined();

    const withoutSku = createProductRequestSchema.parse({
      productCategoryId: 'cat_1',
      name: 'Shampoo 1L',
      priceInCents: 1800,
      trackInventory: false,
    });

    expect(withoutSku.sku).toBeUndefined();
  });

  it('rejects product updates with no fields', () => {
    expect(() => updateProductRequestSchema.parse({})).toThrow();
    expect(updateProductRequestSchema.parse({ isAvailable: false }).isAvailable).toBe(false);
  });

  it('allows only documented inventory movement types', () => {
    expect(inventoryMovementTypeSchema.parse('ADJUST_IN')).toBe('ADJUST_IN');
    expect(inventoryMovementTypeSchema.parse('INITIAL_STOCK')).toBe('INITIAL_STOCK');
    expect(() => inventoryMovementTypeSchema.parse('MAGIC')).toThrow();
  });

  it('requires positive quantities and a valid location/product pair for movements', () => {
    const movement = createInventoryMovementRequestSchema.parse({
      locationId: 'loc_1',
      productId: 'prod_1',
      movementType: 'ADJUST_IN',
      quantity: 5,
      reason: 'Stocktake correction',
    });

    expect(movement.quantity).toBe(5);
    expect(movement.reason).toBe('Stocktake correction');
  });

  it('rejects inventory movements with zero quantities or missing references', () => {
    expect(() =>
      createInventoryMovementRequestSchema.parse({
        locationId: 'loc_1',
        productId: 'prod_1',
        movementType: 'ADJUST_IN',
        quantity: 0,
      }),
    ).toThrow();
    expect(() =>
      createInventoryMovementRequestSchema.parse({
        locationId: '',
        productId: 'prod_1',
        movementType: 'ADJUST_IN',
        quantity: 1,
      }),
    ).toThrow();
  });

  it('parses full summary shapes used by the read endpoints', () => {
    const now = '2026-09-23T08:00:00.000Z';

    expect(
      serviceCategorySummarySchema.parse({
        id: 'cat_1',
        organizationId: 'org_1',
        name: 'Cuts',
        description: null,
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      }),
    ).toMatchObject({ name: 'Cuts' });

    expect(
      productCategorySummarySchema.parse({
        id: 'pcat_1',
        organizationId: 'org_1',
        name: 'Retail',
        description: null,
        sortOrder: 2,
        createdAt: now,
        updatedAt: now,
      }),
    ).toMatchObject({ name: 'Retail' });

    expect(
      serviceSummarySchema.parse({
        id: 'svc_1',
        organizationId: 'org_1',
        serviceCategoryId: 'cat_1',
        name: 'Women’s cut',
        description: null,
        durationMinutes: 45,
        priceInCents: 4500,
        sortOrder: 0,
        isAvailable: true,
        createdAt: now,
        updatedAt: now,
      }),
    ).toMatchObject({ durationMinutes: 45, priceInCents: 4500 });

    expect(
      productSummarySchema.parse({
        id: 'prod_1',
        organizationId: 'org_1',
        productCategoryId: 'pcat_1',
        name: 'Shampoo 1L',
        description: null,
        sku: 'SHMP-001',
        priceInCents: 1800,
        costInCents: 900,
        trackInventory: true,
        isAvailable: true,
        createdAt: now,
        updatedAt: now,
      }),
    ).toMatchObject({ sku: 'SHMP-001', costInCents: 900 });

    expect(
      inventoryLevelSummarySchema.parse({
        productId: 'prod_1',
        locationId: 'loc_1',
        product: {
          id: 'prod_1',
          organizationId: 'org_1',
          productCategoryId: 'pcat_1',
          name: 'Shampoo 1L',
          description: null,
          sku: 'SHMP-001',
          priceInCents: 1800,
          costInCents: 900,
          trackInventory: true,
          isAvailable: true,
          createdAt: now,
          updatedAt: now,
        },
        quantityOnHand: 12,
        createdAt: now,
        updatedAt: now,
      }),
    ).toMatchObject({ quantityOnHand: 12 });

    expect(
      inventoryMovementSummarySchema.parse({
        id: 'mov_1',
        organizationId: 'org_1',
        productId: 'prod_1',
        locationId: 'loc_1',
        product: {
          id: 'prod_1',
          organizationId: 'org_1',
          productCategoryId: 'pcat_1',
          name: 'Shampoo 1L',
          description: null,
          sku: 'SHMP-001',
          priceInCents: 1800,
          costInCents: 900,
          trackInventory: true,
          isAvailable: true,
          createdAt: now,
          updatedAt: now,
        },
        movementType: 'ADJUST_IN',
        quantity: 5,
        reason: null,
        performedById: null,
        performedBy: null,
        createdAt: now,
      }),
    ).toMatchObject({ movementType: 'ADJUST_IN', quantity: 5 });
  });
});
