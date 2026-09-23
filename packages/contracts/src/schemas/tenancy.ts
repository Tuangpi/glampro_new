import { z } from 'zod';
import { apiEnvelopeSchema } from './api.js';
import { emailSchema } from './auth.js';
import {
  locationSummarySchema,
  membershipRoleSchema,
  membershipStatusSchema,
  membershipSummarySchema,
  organizationStatusSchema,
} from './organization.js';

export const invitationStatuses = ['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'] as const;
export const auditActorTypes = ['USER', 'PLATFORM_ADMIN', 'SYSTEM', 'WEBHOOK'] as const;
/** Status transitions a membership accepts after it exists; `INVITED` is reached only through acceptance. */
export const memberStatusActions = ['ACTIVE', 'SUSPENDED', 'REMOVED'] as const;

export const invitationStatusSchema = z.enum(invitationStatuses);
export const auditActorTypeSchema = z.enum(auditActorTypes);
export const memberStatusActionSchema = z.enum(memberStatusActions);

/** 24-hour wall-clock time as stored in `BusinessHour`, for example `09:00`. */
export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour HH:MM time');

export const businessHourSchema = z.object({
  /** 0 is Sunday, matching the `BusinessHour.dayOfWeek` convention. */
  dayOfWeek: z.number().int().min(0).max(6),
  opensAt: timeOfDaySchema.nullable(),
  closesAt: timeOfDaySchema.nullable(),
  isClosed: z.boolean(),
});

export const updateOrganizationRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    legalName: z.string().trim().max(200).nullish(),
    registrationNumber: z.string().trim().max(80).nullish(),
    gstRegistrationNumber: z.string().trim().max(80).nullish(),
    defaultTimezone: z.string().trim().min(1).max(100).optional(),
    logoUrl: z.string().trim().max(500).nullish(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one field to update',
  });

const locationCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(30)
  .regex(/^[A-Za-z0-9-]+$/, 'Use letters, numbers, and hyphens');

const receiptPrefixSchema = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9]+$/, 'Use letters and numbers only');

const locationDetailFields = {
  name: z.string().trim().min(2).max(160).optional(),
  code: locationCodeSchema.optional(),
  phone: z.string().trim().max(40).nullish(),
  email: emailSchema.nullish(),
  addressLine1: z.string().trim().max(200).nullish(),
  addressLine2: z.string().trim().max(200).nullish(),
  city: z.string().trim().max(100).nullish(),
  postalCode: z.string().trim().max(30).nullish(),
  countryCode: z.string().trim().length(2).optional(),
  timezone: z.string().trim().min(1).max(100).optional(),
  pricesIncludeTax: z.boolean().optional(),
  receiptPrefix: receiptPrefixSchema.optional(),
  isActive: z.boolean().optional(),
};

export const createLocationRequestSchema = z.object({
  name: z.string().trim().min(2).max(160),
  code: locationCodeSchema.optional(),
  phone: locationDetailFields.phone,
  email: locationDetailFields.email,
  addressLine1: locationDetailFields.addressLine1,
  addressLine2: locationDetailFields.addressLine2,
  city: locationDetailFields.city,
  postalCode: locationDetailFields.postalCode,
  countryCode: locationDetailFields.countryCode,
  timezone: locationDetailFields.timezone,
  pricesIncludeTax: locationDetailFields.pricesIncludeTax,
  receiptPrefix: locationDetailFields.receiptPrefix,
});

/**
 * Currency, receipt counters, and organization scope are deliberately absent:
 * the sale transaction owns `nextReceiptNumber`, and currency changes are not
 * part of tenancy administration.
 */
export const updateLocationRequestSchema = z
  .object(locationDetailFields)
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one field to update',
  });

export const businessHoursRequestSchema = z
  .object({ hours: z.array(businessHourSchema) })
  .refine(
    (value) =>
      value.hours.length === 7 && new Set(value.hours.map((hour) => hour.dayOfWeek)).size === 7,
    { message: 'Provide exactly one entry for each weekday' },
  )
  .refine(
    (value) =>
      value.hours.every(
        (hour) =>
          hour.isClosed ||
          (hour.opensAt !== null && hour.closesAt !== null && hour.opensAt < hour.closesAt),
      ),
    { message: 'Open days need an opening time before the closing time' },
  );

export const inviteMemberRequestSchema = z.object({
  email: emailSchema,
  role: membershipRoleSchema,
});

export const changeMemberRoleRequestSchema = z.object({
  role: membershipRoleSchema,
});

export const changeMemberStatusRequestSchema = z.object({
  status: memberStatusActionSchema,
});

export const acceptInvitationRequestSchema = z.object({
  token: z.string().trim().min(1).max(512),
});

export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const organizationSettingsSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  status: organizationStatusSchema,
  legalName: z.string().nullable(),
  registrationNumber: z.string().nullable(),
  gstRegistrationNumber: z.string().nullable(),
  defaultCurrency: z.string().length(3),
  defaultTimezone: z.string().min(1),
  logoUrl: z.string().nullable(),
});

/**
 * Shared patterns for catalog and inventory entities.
 *
 * Money is stored and passed as integer minor units (cents for SGD), and every
 * entity is tenant-scoped through `organizationId`. The name/price/availability
 * fields mirror what the POS and appointment modules will later snapshot, so the
 * same shapes can be reused without inventing new transfer types.
 */
export const categoryNameSchema = z.string().trim().min(1).max(120);

export const descriptionSchema = z.string().trim().max(500).nullish();

export const unitPriceSchema = z.number().int().min(0).max(1_000_000_000);

export const skuSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._ -]*$/, 'Use letters, numbers, and basic punctuation');

export const trackInventorySchema = z.boolean();

/**
 * Services are the bookable/non-bookable offerings a salon sells: cuts, colours,
 * treatments, packages, and add-ons. Duration is stored in whole minutes.
 */
export const serviceNameSchema = z.string().trim().min(1).max(160);

export const serviceDurationSchema = z.number().int().min(0).max(1_440);

export type CategoryName = z.infer<typeof categoryNameSchema>;
export type Description = z.infer<typeof descriptionSchema>;
export type UnitPrice = z.infer<typeof unitPriceSchema>;
export type Sku = z.infer<typeof skuSchema>;
export type TrackInventory = z.infer<typeof trackInventorySchema>;
export type ServiceName = z.infer<typeof serviceNameSchema>;
export type ServiceDuration = z.infer<typeof serviceDurationSchema>;

export const locationDetailSchema = locationSummarySchema.extend({
  phone: z.string().nullable(),
  email: z.string().nullable(),
  addressLine1: z.string().nullable(),
  addressLine2: z.string().nullable(),
  city: z.string().nullable(),
  postalCode: z.string().nullable(),
  countryCode: z.string().length(2),
  pricesIncludeTax: z.boolean(),
  receiptPrefix: z.string().min(1),
  nextReceiptNumber: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const memberSummarySchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  role: membershipRoleSchema,
  status: membershipStatusSchema,
  joinedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  isSelf: z.boolean(),
  user: z.object({
    id: z.string().min(1),
    email: z.string().min(1),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    avatarUrl: z.string().nullable(),
  }),
});

export const invitationSummarySchema = z.object({
  id: z.string().min(1),
  email: z.string().min(1),
  role: membershipRoleSchema,
  status: invitationStatusSchema,
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  invitedBy: z.object({
    id: z.string().min(1),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
  }),
});

export const auditLogEntrySchema = z.object({
  id: z.string().min(1),
  action: z.string().min(1),
  actorType: auditActorTypeSchema,
  actorUserId: z.string().nullable(),
  actor: z
    .object({
      id: z.string().min(1),
      email: z.string().min(1),
      firstName: z.string().min(1),
      lastName: z.string().min(1),
    })
    .nullable(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  requestId: z.string().nullable(),
  ipAddress: z.string().nullable(),
  createdAt: z.iso.datetime(),
  metadata: z.unknown(),
});

export const auditLogPageSchema = z.object({
  items: z.array(auditLogEntrySchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export const locationsDataSchema = z.object({ locations: z.array(locationDetailSchema) });
export const locationDataSchema = z.object({ location: locationDetailSchema });
export const businessHoursDataSchema = z.object({ hours: z.array(businessHourSchema) });
export const membersDataSchema = z.object({ members: z.array(memberSummarySchema) });
export const memberDataSchema = z.object({ member: memberSummarySchema });
export const invitationsDataSchema = z.object({ invitations: z.array(invitationSummarySchema) });
export const invitationDataSchema = z.object({ invitation: invitationSummarySchema });
export const acceptedInvitationDataSchema = z.object({ membership: membershipSummarySchema });

/**
 * Catalog and inventory contracts.
 *
 * These shapes are intentionally separate from tenancy administration because
 * they feed the POS and appointment modules. Categories are simple tenant-scoped
 * grouping rows; services and products carry pricing and availability; inventory
 * levels are derived from an append-only movement ledger.
 */

/** Ordered grouping for services. */
export const serviceCategoryRequestSchema = z.object({
  name: categoryNameSchema,
  description: descriptionSchema.optional(),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
});

/** Update payload for a service category. At least one field must be provided. */
export const updateServiceCategoryRequestSchema = z
  .object({
    name: categoryNameSchema.optional(),
    description: descriptionSchema.optional(),
    sortOrder: z.number().int().min(0).max(10_000).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one field to update',
  });

/** Ordered grouping for products. */
export const productCategoryRequestSchema = z.object({
  name: categoryNameSchema,
  description: descriptionSchema.optional(),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
});

/** Update payload for a product category. At least one field must be provided. */
export const updateProductCategoryRequestSchema = z
  .object({
    name: categoryNameSchema.optional(),
    description: descriptionSchema.optional(),
    sortOrder: z.number().int().min(0).max(10_000).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one field to update',
  });

/** A bookable or sellable service line, for example “Women’s cut” or “Full highlights”. */
export const createServiceRequestSchema = z.object({
  serviceCategoryId: z.string().trim().min(1).max(64),
  name: serviceNameSchema,
  description: descriptionSchema.optional(),
  durationMinutes: serviceDurationSchema,
  priceInCents: unitPriceSchema,
  sortOrder: z.number().int().min(0).max(10_000).default(0),
  isAvailable: z.boolean().default(true),
});

/** Partial update of a service. At least one field must be provided. */
export const updateServiceRequestSchema = z
  .object({
    serviceCategoryId: z.string().trim().min(1).max(64).optional(),
    name: serviceNameSchema.optional(),
    description: descriptionSchema.optional(),
    durationMinutes: serviceDurationSchema.optional(),
    priceInCents: unitPriceSchema.optional(),
    sortOrder: z.number().int().min(0).max(10_000).optional(),
    isAvailable: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one field to update',
  });

/** A physical or digital product that can be sold at the point of sale. */
export const createProductRequestSchema = z.object({
  productCategoryId: z.string().trim().min(1).max(64),
  name: serviceNameSchema,
  description: descriptionSchema.optional(),
  sku: skuSchema.optional(),
  priceInCents: unitPriceSchema,
  costInCents: z.number().int().min(0).max(1_000_000_000).optional(),
  trackInventory: trackInventorySchema,
  isAvailable: z.boolean().default(true),
});

/** Partial update of a product. At least one field must be provided. */
export const updateProductRequestSchema = z
  .object({
    productCategoryId: z.string().trim().min(1).max(64).optional(),
    name: serviceNameSchema.optional(),
    description: descriptionSchema.optional(),
    sku: skuSchema.optional(),
    priceInCents: unitPriceSchema.optional(),
    costInCents: z.number().int().min(0).max(1_000_000_000).optional(),
    trackInventory: trackInventorySchema.optional(),
    isAvailable: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one field to update',
  });

/**
 * Inventory adjustments are append-only movements, not direct edits to stock.
 * `reason` is optional operational context, not validated beyond length.
 */
export const inventoryMovementTypeSchema = z.enum([
  'ADJUST_IN',
  'ADJUST_OUT',
  'SALE',
  'RETURN',
  'STOCK_CORRECTION',
  'DAMAGE',
  'EXPIRY',
  'INITIAL_STOCK',
]);

export const createInventoryMovementRequestSchema = z.object({
  locationId: z.string().trim().min(1).max(64),
  productId: z.string().trim().min(1).max(64),
  movementType: inventoryMovementTypeSchema,
  quantity: z.number().int().min(1).max(1_000_000),
  reason: z.string().trim().max(255).optional(),
});

/** Optional narrowing for the catalog read endpoints; omitted means "all". */
export const serviceQuerySchema = z.object({
  serviceCategoryId: z.string().trim().min(1).max(64).optional(),
});

export const productQuerySchema = z.object({
  productCategoryId: z.string().trim().min(1).max(64).optional(),
});

export const inventoryLevelQuerySchema = z.object({
  locationId: z.string().trim().min(1).max(64).optional(),
});

export const inventoryMovementQuerySchema = z.object({
  productId: z.string().trim().min(1).max(64).optional(),
});

export const serviceCategorySummarySchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  sortOrder: z.number().int().min(0).max(10_000),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const serviceCategoryDataSchema = z.object({
  serviceCategory: serviceCategorySummarySchema,
});
export const serviceCategoriesDataSchema = z.object({
  serviceCategories: z.array(serviceCategorySummarySchema),
});

export const productCategorySummarySchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  sortOrder: z.number().int().min(0).max(10_000),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const productCategoryDataSchema = z.object({
  productCategory: productCategorySummarySchema,
});
export const productCategoriesDataSchema = z.object({
  productCategories: z.array(productCategorySummarySchema),
});

export const serviceSummarySchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  serviceCategoryId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  durationMinutes: z.number().int().min(0).max(1_440),
  priceInCents: z.number().int().min(0).max(1_000_000_000),
  sortOrder: z.number().int().min(0).max(10_000),
  isAvailable: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const serviceDataSchema = z.object({ service: serviceSummarySchema });
export const servicesDataSchema = z.object({ services: z.array(serviceSummarySchema) });

export const productSummarySchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  productCategoryId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  sku: z.string().nullable(),
  priceInCents: z.number().int().min(0).max(1_000_000_000),
  costInCents: z.number().int().nullable(),
  trackInventory: z.boolean(),
  isAvailable: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const productDataSchema = z.object({ product: productSummarySchema });
export const productsDataSchema = z.object({ products: z.array(productSummarySchema) });

export const inventoryLevelSummarySchema = z.object({
  productId: z.string().min(1),
  locationId: z.string().min(1),
  product: productSummarySchema,
  quantityOnHand: z.number().int().min(0).max(1_000_000),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const inventoryLevelsDataSchema = z.object({
  inventoryLevels: z.array(inventoryLevelSummarySchema),
});

export const inventoryMovementSummarySchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  productId: z.string().min(1),
  locationId: z.string().min(1),
  product: productSummarySchema,
  movementType: inventoryMovementTypeSchema,
  quantity: z.number().int().min(1).max(1_000_000),
  reason: z.string().nullable(),
  performedById: z.string().nullable(),
  performedBy: z
    .object({
      id: z.string().min(1),
      email: z.string().min(1),
      firstName: z.string().min(1),
      lastName: z.string().min(1),
    })
    .nullable(),
  createdAt: z.iso.datetime(),
});

export const inventoryMovementDataSchema = z.object({
  inventoryMovement: inventoryMovementSummarySchema,
});
export const inventoryMovementsDataSchema = z.object({
  inventoryMovements: z.array(inventoryMovementSummarySchema),
});

/**
 * Read models are intentionally snapshots: the API returns the current name, sku,
 * and price alongside inventory levels, because the POS and inventory screens need
 * stable display values without extra round-trips.
 */

export type InvitationStatus = z.infer<typeof invitationStatusSchema>;
export type MemberStatusAction = z.infer<typeof memberStatusActionSchema>;
export type BusinessHour = z.infer<typeof businessHourSchema>;
export type UpdateOrganizationRequest = z.infer<typeof updateOrganizationRequestSchema>;
export type CreateLocationRequest = z.infer<typeof createLocationRequestSchema>;
export type UpdateLocationRequest = z.infer<typeof updateLocationRequestSchema>;
export type BusinessHoursRequest = z.infer<typeof businessHoursRequestSchema>;
export type InviteMemberRequest = z.infer<typeof inviteMemberRequestSchema>;
export type ChangeMemberRoleRequest = z.infer<typeof changeMemberRoleRequestSchema>;
export type ChangeMemberStatusRequest = z.infer<typeof changeMemberStatusRequestSchema>;
export type AcceptInvitationRequest = z.infer<typeof acceptInvitationRequestSchema>;
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
export type OrganizationSettings = z.infer<typeof organizationSettingsSchema>;
export type LocationDetail = z.infer<typeof locationDetailSchema>;
export type MemberSummary = z.infer<typeof memberSummarySchema>;
export type InvitationSummary = z.infer<typeof invitationSummarySchema>;
export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;
export type AuditLogPage = z.infer<typeof auditLogPageSchema>;

export type ServiceCategorySummary = z.infer<typeof serviceCategorySummarySchema>;
export type ServiceCategoryRequest = z.infer<typeof serviceCategoryRequestSchema>;
export type UpdateServiceCategoryRequest = z.infer<typeof updateServiceCategoryRequestSchema>;

export type ProductCategorySummary = z.infer<typeof productCategorySummarySchema>;
export type ProductCategoryRequest = z.infer<typeof productCategoryRequestSchema>;
export type UpdateProductCategoryRequest = z.infer<typeof updateProductCategoryRequestSchema>;

export type ServiceSummary = z.infer<typeof serviceSummarySchema>;
export type ServiceRequest = z.infer<typeof createServiceRequestSchema>;
export type UpdateServiceRequest = z.infer<typeof updateServiceRequestSchema>;

export type ProductSummary = z.infer<typeof productSummarySchema>;
export type ProductRequest = z.infer<typeof createProductRequestSchema>;
export type UpdateProductRequest = z.infer<typeof updateProductRequestSchema>;

export type InventoryLevelSummary = z.infer<typeof inventoryLevelSummarySchema>;
export type InventoryMovementSummary = z.infer<typeof inventoryMovementSummarySchema>;
export type InventoryMovementRequest = z.infer<typeof createInventoryMovementRequestSchema>;
export type InventoryMovementType = z.infer<typeof inventoryMovementTypeSchema>;
export type ServiceQuery = z.infer<typeof serviceQuerySchema>;
export type ProductQuery = z.infer<typeof productQuerySchema>;
export type InventoryLevelQuery = z.infer<typeof inventoryLevelQuerySchema>;
export type InventoryMovementQuery = z.infer<typeof inventoryMovementQuerySchema>;

export const organizationSettingsResponseSchema = apiEnvelopeSchema(organizationSettingsSchema);
export const locationsResponseSchema = apiEnvelopeSchema(locationsDataSchema);
export const locationResponseSchema = apiEnvelopeSchema(locationDataSchema);
export const businessHoursResponseSchema = apiEnvelopeSchema(businessHoursDataSchema);
export const membersResponseSchema = apiEnvelopeSchema(membersDataSchema);
export const memberResponseSchema = apiEnvelopeSchema(memberDataSchema);
export const invitationsResponseSchema = apiEnvelopeSchema(invitationsDataSchema);
export const invitationResponseSchema = apiEnvelopeSchema(invitationDataSchema);
export const acceptedInvitationResponseSchema = apiEnvelopeSchema(acceptedInvitationDataSchema);
export const auditLogResponseSchema = apiEnvelopeSchema(auditLogPageSchema);

export const serviceCategoryResponseSchema = apiEnvelopeSchema(serviceCategoryDataSchema);
export const serviceCategoriesResponseSchema = apiEnvelopeSchema(serviceCategoriesDataSchema);
export const serviceResponseSchema = apiEnvelopeSchema(serviceDataSchema);
export const servicesResponseSchema = apiEnvelopeSchema(servicesDataSchema);
export const productCategoryResponseSchema = apiEnvelopeSchema(productCategoryDataSchema);
export const productCategoriesResponseSchema = apiEnvelopeSchema(productCategoriesDataSchema);
export const productResponseSchema = apiEnvelopeSchema(productDataSchema);
export const productsResponseSchema = apiEnvelopeSchema(productsDataSchema);
export const inventoryLevelsResponseSchema = apiEnvelopeSchema(inventoryLevelsDataSchema);
export const inventoryMovementResponseSchema = apiEnvelopeSchema(inventoryMovementDataSchema);
export const inventoryMovementsResponseSchema = apiEnvelopeSchema(inventoryMovementsDataSchema);
