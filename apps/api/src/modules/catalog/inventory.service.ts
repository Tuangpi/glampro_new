import type {
  InventoryLevelSummary,
  InventoryMovementRequest,
  InventoryMovementSummary,
  InventoryMovementType,
} from '@glampro/contracts';
import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { type AuditContext, recordAuditEvent } from '../../shared/audit.js';
import { AppError } from '../../shared/http/app-error.js';
import { type ProductRow, scopedProductRow, toProduct } from './catalog.service.js';

/**
 * Inventory is an append-only movement ledger; `InventoryLevel` is the current
 * quantity derived from it. Adjustments always name a product and a location,
 * and every write is scoped to the tenant that owns both.
 */

const movementProductSelection = {
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

const levelSelection = {
  productId: true,
  locationId: true,
  quantityOnHand: true,
  createdAt: true,
  updatedAt: true,
  product: { select: movementProductSelection },
} as const;

const movementSelection = {
  id: true,
  organizationId: true,
  productId: true,
  locationId: true,
  movementType: true,
  quantity: true,
  reason: true,
  performedById: true,
  createdAt: true,
  product: { select: movementProductSelection },
  performedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
} as const;

type LevelRow = Prisma.InventoryLevelGetPayload<{ select: typeof levelSelection }>;
type MovementRow = Prisma.InventoryMovementGetPayload<{ select: typeof movementSelection }>;

const toInventoryLevel = (row: LevelRow): InventoryLevelSummary => ({
  productId: row.productId,
  locationId: row.locationId,
  product: toProduct(row.product as ProductRow),
  quantityOnHand: row.quantityOnHand,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const toInventoryMovement = (row: MovementRow): InventoryMovementSummary => ({
  id: row.id,
  organizationId: row.organizationId,
  productId: row.productId,
  locationId: row.locationId,
  product: toProduct(row.product as ProductRow),
  movementType: row.movementType,
  quantity: row.quantity,
  reason: row.reason,
  performedById: row.performedById,
  performedBy: row.performedBy,
  createdAt: row.createdAt.toISOString(),
});

/**
 * Movement types that add stock. Every other type removes it, because the
 * contract carries an always-positive `quantity` and puts the direction on the
 * type. `STOCK_CORRECTION` is a write-off, so a surplus is recorded as
 * `ADJUST_IN` instead.
 */
const inboundMovementTypes = new Set<InventoryMovementType>([
  'ADJUST_IN',
  'RETURN',
  'INITIAL_STOCK',
]);

export const movementDelta = (movementType: InventoryMovementType, quantity: number): number =>
  inboundMovementTypes.has(movementType) ? quantity : -quantity;

const scopedLocationRow = async (organizationId: string, locationId: string) => {
  const location = await prisma.location.findFirst({
    where: { id: locationId, organizationId },
    select: { id: true, name: true },
  });

  if (!location) {
    throw new AppError(404, 'NOT_FOUND', 'Location was not found');
  }

  return location;
};

export const listInventoryLevels = async (
  organizationId: string,
  locationId?: string,
): Promise<InventoryLevelSummary[]> => {
  const levels = await prisma.inventoryLevel.findMany({
    where: { organizationId, ...(locationId ? { locationId } : {}) },
    select: levelSelection,
    orderBy: [{ product: { name: 'asc' } }],
  });

  return levels.map(toInventoryLevel);
};

export const listInventoryMovements = async (
  organizationId: string,
  productId?: string,
): Promise<InventoryMovementSummary[]> => {
  const movements = await prisma.inventoryMovement.findMany({
    where: { organizationId, ...(productId ? { productId } : {}) },
    select: movementSelection,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return movements.map(toInventoryMovement);
};

export const createInventoryMovement = async (
  organizationId: string,
  input: InventoryMovementRequest,
  actorUserId: string,
  context: AuditContext,
): Promise<InventoryMovementSummary> => {
  const product = await scopedProductRow(organizationId, input.productId);

  if (!product.trackInventory) {
    throw new AppError(409, 'CONFLICT', 'This product does not track inventory');
  }

  await scopedLocationRow(organizationId, input.locationId);

  const delta = movementDelta(input.movementType, input.quantity);

  const created = await prisma.$transaction(async (transaction) => {
    const level = await transaction.inventoryLevel.upsert({
      where: {
        organizationId_productId_locationId: {
          organizationId,
          productId: product.id,
          locationId: input.locationId,
        },
      },
      create: {
        organizationId,
        productId: product.id,
        locationId: input.locationId,
        quantityOnHand: delta,
      },
      update: { quantityOnHand: { increment: delta } },
      select: { quantityOnHand: true },
    });

    // Stock cannot go negative through a manual adjustment.
    if (level.quantityOnHand < 0) {
      throw new AppError(409, 'CONFLICT', 'This adjustment would leave the stock below zero');
    }

    return transaction.inventoryMovement.create({
      data: {
        organizationId,
        productId: product.id,
        locationId: input.locationId,
        movementType: input.movementType,
        quantity: input.quantity,
        reason: input.reason ?? null,
        performedById: actorUserId,
      },
      select: movementSelection,
    });
  });

  await recordAuditEvent(context, {
    action: 'inventory.movement_recorded',
    actorType: 'USER',
    organizationId,
    actorUserId,
    entityType: 'InventoryMovement',
    entityId: created.id,
    metadata: {
      productId: created.productId,
      locationId: created.locationId,
      movementType: created.movementType,
      quantity: created.quantity,
    },
  });

  return toInventoryMovement(created);
};
