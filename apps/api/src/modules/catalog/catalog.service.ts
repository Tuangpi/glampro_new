import type {
  ProductCategoryRequest,
  ProductCategorySummary,
  ProductRequest,
  ProductSummary,
  ServiceCategoryRequest,
  ServiceCategorySummary,
  ServiceRequest,
  ServiceSummary,
  UpdateProductCategoryRequest,
  UpdateProductRequest,
  UpdateServiceCategoryRequest,
  UpdateServiceRequest,
} from '@glampro/contracts';
import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { type AuditContext, recordAuditEvent } from '../../shared/audit.js';
import { AppError } from '../../shared/http/app-error.js';

/**
 * Catalog services: service and product categories plus their offerings.
 *
 * Every read and write is tenant-scoped through `organizationId`, so an ID from
 * another organization surfaces as `404` rather than confirming it exists. Money
 * is stored as integer minor units (cents) exactly as the contracts declare.
 */

const serviceCategorySelection = {
  id: true,
  organizationId: true,
  name: true,
  description: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const serviceSelection = {
  id: true,
  organizationId: true,
  serviceCategoryId: true,
  name: true,
  description: true,
  durationMinutes: true,
  priceInCents: true,
  sortOrder: true,
  isAvailable: true,
  createdAt: true,
  updatedAt: true,
} as const;

const productCategorySelection = {
  id: true,
  organizationId: true,
  name: true,
  description: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const productSelection = {
  id: true,
  organizationId: true,
  productCategoryId: true,
  name: true,
  description: true,
  sku: true,
  priceInCents: true,
  costInCents: true,
  trackInventory: true,
  isAvailable: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type ProductRow = Prisma.ProductGetPayload<{ select: typeof productSelection }>;

type ServiceCategoryRow = Prisma.ServiceCategoryGetPayload<{
  select: typeof serviceCategorySelection;
}>;
/** Exported so the staff module can reuse the projection for assigned services. */
export type ServiceRow = Prisma.ServiceGetPayload<{ select: typeof serviceSelection }>;
type ProductCategoryRow = Prisma.ProductCategoryGetPayload<{
  select: typeof productCategorySelection;
}>;

const toServiceCategory = (row: ServiceCategoryRow): ServiceCategorySummary => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export const toService = (row: ServiceRow): ServiceSummary => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const toProductCategory = (row: ProductCategoryRow): ProductCategorySummary => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export const toProduct = (row: ProductRow): ProductSummary => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/** Category names are unique per tenant, so a clash reads as a conflict. */
const assertUniqueCategoryName = async (
  model: 'serviceCategory' | 'productCategory',
  organizationId: string,
  name: string,
  excludingId: string | null,
) => {
  const existing =
    model === 'serviceCategory'
      ? await prisma.serviceCategory.findFirst({
          where: { organizationId, name, ...(excludingId ? { id: { not: excludingId } } : {}) },
          select: { id: true },
        })
      : await prisma.productCategory.findFirst({
          where: { organizationId, name, ...(excludingId ? { id: { not: excludingId } } : {}) },
          select: { id: true },
        });

  if (existing) {
    throw new AppError(409, 'CONFLICT', 'A category with this name already exists');
  }
};

const assertUniqueSku = async (
  organizationId: string,
  sku: string,
  excludingProductId: string | null,
) => {
  const existing = await prisma.product.findFirst({
    where: {
      organizationId,
      sku,
      ...(excludingProductId ? { id: { not: excludingProductId } } : {}),
    },
    select: { id: true },
  });

  if (existing) {
    throw new AppError(409, 'CONFLICT', 'A product with this SKU already exists');
  }
};

/** Resolves a category or offering inside the tenant, or fails with 404. */
const scopedServiceCategoryId = async (organizationId: string, serviceCategoryId: string) => {
  const category = await prisma.serviceCategory.findFirst({
    where: { id: serviceCategoryId, organizationId },
    select: { id: true },
  });

  if (!category) {
    throw new AppError(404, 'NOT_FOUND', 'Service category was not found');
  }

  return category.id;
};

const scopedProductCategoryId = async (organizationId: string, productCategoryId: string) => {
  const category = await prisma.productCategory.findFirst({
    where: { id: productCategoryId, organizationId },
    select: { id: true },
  });

  if (!category) {
    throw new AppError(404, 'NOT_FOUND', 'Product category was not found');
  }

  return category.id;
};

const scopedServiceRow = async (organizationId: string, serviceId: string) => {
  const service = await prisma.service.findFirst({
    where: { id: serviceId, organizationId },
    select: serviceSelection,
  });

  if (!service) {
    throw new AppError(404, 'NOT_FOUND', 'Service was not found');
  }

  return service;
};

export const scopedProductRow = async (organizationId: string, productId: string) => {
  const product = await prisma.product.findFirst({
    where: { id: productId, organizationId },
    select: productSelection,
  });

  if (!product) {
    throw new AppError(404, 'NOT_FOUND', 'Product was not found');
  }

  return product;
};

/** Service categories, ordered the way a menu would be read. */

export const listServiceCategories = async (
  organizationId: string,
): Promise<ServiceCategorySummary[]> => {
  const categories = await prisma.serviceCategory.findMany({
    where: { organizationId },
    select: serviceCategorySelection,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  return categories.map(toServiceCategory);
};

export const createServiceCategory = async (
  organizationId: string,
  input: ServiceCategoryRequest,
  actorUserId: string,
  context: AuditContext,
): Promise<ServiceCategorySummary> => {
  await assertUniqueCategoryName('serviceCategory', organizationId, input.name, null);

  const created = await prisma.serviceCategory.create({
    data: {
      organizationId,
      name: input.name,
      description: input.description ?? null,
      sortOrder: input.sortOrder,
    },
    select: serviceCategorySelection,
  });

  await recordAuditEvent(context, {
    action: 'catalog.service_category_created',
    actorType: 'USER',
    organizationId,
    actorUserId,
    entityType: 'ServiceCategory',
    entityId: created.id,
    metadata: { name: created.name },
  });

  return toServiceCategory(created);
};

export const updateServiceCategory = async (
  organizationId: string,
  categoryId: string,
  input: UpdateServiceCategoryRequest,
  actorUserId: string,
  context: AuditContext,
): Promise<ServiceCategorySummary> => {
  const category = await prisma.serviceCategory.findFirst({
    where: { id: categoryId, organizationId },
    select: { id: true },
  });

  if (!category) {
    throw new AppError(404, 'NOT_FOUND', 'Service category was not found');
  }

  if (input.name !== undefined) {
    await assertUniqueCategoryName('serviceCategory', organizationId, input.name, category.id);
  }

  const updated = await prisma.serviceCategory.update({
    where: { id: category.id },
    data: {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
    },
    select: serviceCategorySelection,
  });

  await recordAuditEvent(context, {
    action: 'catalog.service_category_updated',
    actorType: 'USER',
    organizationId,
    actorUserId,
    entityType: 'ServiceCategory',
    entityId: category.id,
    metadata: { fields: Object.keys(input) },
  });

  return toServiceCategory(updated);
};

/** Services. */

export const listServices = async (
  organizationId: string,
  serviceCategoryId?: string,
): Promise<ServiceSummary[]> => {
  const services = await prisma.service.findMany({
    where: { organizationId, ...(serviceCategoryId ? { serviceCategoryId } : {}) },
    select: serviceSelection,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  return services.map(toService);
};

export const serviceDetailOf = async (
  organizationId: string,
  serviceId: string,
): Promise<ServiceSummary> => toService(await scopedServiceRow(organizationId, serviceId));

export const createService = async (
  organizationId: string,
  input: ServiceRequest,
  actorUserId: string,
  context: AuditContext,
): Promise<ServiceSummary> => {
  const serviceCategoryId = await scopedServiceCategoryId(organizationId, input.serviceCategoryId);

  const created = await prisma.service.create({
    data: {
      organizationId,
      serviceCategoryId,
      name: input.name,
      description: input.description ?? null,
      durationMinutes: input.durationMinutes,
      priceInCents: input.priceInCents,
      sortOrder: input.sortOrder,
      isAvailable: input.isAvailable,
    },
    select: serviceSelection,
  });

  await recordAuditEvent(context, {
    action: 'catalog.service_created',
    actorType: 'USER',
    organizationId,
    actorUserId,
    entityType: 'Service',
    entityId: created.id,
    metadata: { name: created.name, priceInCents: created.priceInCents },
  });

  return toService(created);
};

export const updateService = async (
  organizationId: string,
  serviceId: string,
  input: UpdateServiceRequest,
  actorUserId: string,
  context: AuditContext,
): Promise<ServiceSummary> => {
  const service = await scopedServiceRow(organizationId, serviceId);
  const serviceCategoryId =
    input.serviceCategoryId === undefined
      ? undefined
      : await scopedServiceCategoryId(organizationId, input.serviceCategoryId);

  const updated = await prisma.service.update({
    where: { id: service.id },
    data: {
      ...(serviceCategoryId === undefined ? {} : { serviceCategoryId }),
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.durationMinutes === undefined ? {} : { durationMinutes: input.durationMinutes }),
      ...(input.priceInCents === undefined ? {} : { priceInCents: input.priceInCents }),
      ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
      ...(input.isAvailable === undefined ? {} : { isAvailable: input.isAvailable }),
    },
    select: serviceSelection,
  });

  await recordAuditEvent(context, {
    action: 'catalog.service_updated',
    actorType: 'USER',
    organizationId,
    actorUserId,
    entityType: 'Service',
    entityId: service.id,
    metadata: { fields: Object.keys(input) },
  });

  return toService(updated);
};

/** Product categories and products. */

export const listProductCategories = async (
  organizationId: string,
): Promise<ProductCategorySummary[]> => {
  const categories = await prisma.productCategory.findMany({
    where: { organizationId },
    select: productCategorySelection,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  return categories.map(toProductCategory);
};

export const createProductCategory = async (
  organizationId: string,
  input: ProductCategoryRequest,
  actorUserId: string,
  context: AuditContext,
): Promise<ProductCategorySummary> => {
  await assertUniqueCategoryName('productCategory', organizationId, input.name, null);

  const created = await prisma.productCategory.create({
    data: {
      organizationId,
      name: input.name,
      description: input.description ?? null,
      sortOrder: input.sortOrder,
    },
    select: productCategorySelection,
  });

  await recordAuditEvent(context, {
    action: 'catalog.product_category_created',
    actorType: 'USER',
    organizationId,
    actorUserId,
    entityType: 'ProductCategory',
    entityId: created.id,
    metadata: { name: created.name },
  });

  return toProductCategory(created);
};

export const updateProductCategory = async (
  organizationId: string,
  categoryId: string,
  input: UpdateProductCategoryRequest,
  actorUserId: string,
  context: AuditContext,
): Promise<ProductCategorySummary> => {
  const category = await prisma.productCategory.findFirst({
    where: { id: categoryId, organizationId },
    select: { id: true },
  });

  if (!category) {
    throw new AppError(404, 'NOT_FOUND', 'Product category was not found');
  }

  if (input.name !== undefined) {
    await assertUniqueCategoryName('productCategory', organizationId, input.name, category.id);
  }

  const updated = await prisma.productCategory.update({
    where: { id: category.id },
    data: {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
    },
    select: productCategorySelection,
  });

  await recordAuditEvent(context, {
    action: 'catalog.product_category_updated',
    actorType: 'USER',
    organizationId,
    actorUserId,
    entityType: 'ProductCategory',
    entityId: category.id,
    metadata: { fields: Object.keys(input) },
  });

  return toProductCategory(updated);
};

export const listProducts = async (
  organizationId: string,
  productCategoryId?: string,
): Promise<ProductSummary[]> => {
  const products = await prisma.product.findMany({
    where: { organizationId, ...(productCategoryId ? { productCategoryId } : {}) },
    select: productSelection,
    orderBy: { name: 'asc' },
  });

  return products.map(toProduct);
};

export const productDetailOf = async (
  organizationId: string,
  productId: string,
): Promise<ProductSummary> => toProduct(await scopedProductRow(organizationId, productId));

/**
 * A tracked product starts with an explicit zero-stock row per active location,
 * so the inventory screen can show it before the first movement is recorded.
 */
const createInitialInventoryLevels = async (
  transaction: Prisma.TransactionClient,
  organizationId: string,
  productId: string,
) => {
  const locations = await transaction.location.findMany({
    where: { organizationId, isActive: true },
    select: { id: true },
  });

  if (locations.length === 0) {
    return;
  }

  await transaction.inventoryLevel.createMany({
    data: locations.map((location) => ({
      organizationId,
      productId,
      locationId: location.id,
      quantityOnHand: 0,
    })),
  });
};

export const createProduct = async (
  organizationId: string,
  input: ProductRequest,
  actorUserId: string,
  context: AuditContext,
): Promise<ProductSummary> => {
  const productCategoryId = await scopedProductCategoryId(organizationId, input.productCategoryId);

  if (input.sku !== undefined) {
    await assertUniqueSku(organizationId, input.sku, null);
  }

  const created = await prisma.$transaction(async (transaction) => {
    const product = await transaction.product.create({
      data: {
        organizationId,
        productCategoryId,
        name: input.name,
        description: input.description ?? null,
        sku: input.sku ?? null,
        priceInCents: input.priceInCents,
        costInCents: input.costInCents ?? null,
        trackInventory: input.trackInventory,
        isAvailable: input.isAvailable,
      },
      select: productSelection,
    });

    if (input.trackInventory) {
      await createInitialInventoryLevels(transaction, organizationId, product.id);
    }

    return product;
  });

  await recordAuditEvent(context, {
    action: 'catalog.product_created',
    actorType: 'USER',
    organizationId,
    actorUserId,
    entityType: 'Product',
    entityId: created.id,
    metadata: { name: created.name, sku: created.sku },
  });

  return toProduct(created);
};

export const updateProduct = async (
  organizationId: string,
  productId: string,
  input: UpdateProductRequest,
  actorUserId: string,
  context: AuditContext,
): Promise<ProductSummary> => {
  const product = await scopedProductRow(organizationId, productId);
  const productCategoryId =
    input.productCategoryId === undefined
      ? undefined
      : await scopedProductCategoryId(organizationId, input.productCategoryId);

  if (input.sku !== undefined && input.sku !== product.sku) {
    await assertUniqueSku(organizationId, input.sku, product.id);
  }

  const updated = await prisma.$transaction(async (transaction) => {
    const row = await transaction.product.update({
      where: { id: product.id },
      data: {
        ...(productCategoryId === undefined ? {} : { productCategoryId }),
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.sku === undefined ? {} : { sku: input.sku }),
        ...(input.priceInCents === undefined ? {} : { priceInCents: input.priceInCents }),
        ...(input.costInCents === undefined ? {} : { costInCents: input.costInCents }),
        ...(input.trackInventory === undefined ? {} : { trackInventory: input.trackInventory }),
        ...(input.isAvailable === undefined ? {} : { isAvailable: input.isAvailable }),
      },
      select: productSelection,
    });

    // Turning tracking on later still needs a level row per active location.
    if (input.trackInventory === true && !product.trackInventory) {
      await createInitialInventoryLevels(transaction, organizationId, row.id);
    }

    return row;
  });

  await recordAuditEvent(context, {
    action: 'catalog.product_updated',
    actorType: 'USER',
    organizationId,
    actorUserId,
    entityType: 'Product',
    entityId: product.id,
    metadata: { fields: Object.keys(input) },
  });

  return toProduct(updated);
};
