import { z } from 'zod';
import { apiEnvelopeSchema } from './api.js';
import { locationSummarySchema } from './organization.js';
import { customerSummarySchema, staffProfileSummarySchema } from './people.js';

/** Point-of-sale contracts shared by the API and the browser checkout. */
const idSchema = z.string().trim().min(1).max(64);
const moneySchema = z.number().int().min(0).max(1_000_000_000);
const quantitySchema = z.number().int().min(1).max(1_000_000);

export const saleStatuses = ['COMPLETED', 'VOIDED', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;
export const saleStatusSchema = z.enum(saleStatuses);
export const saleLineTypes = ['SERVICE', 'PRODUCT'] as const;
export const saleLineTypeSchema = z.enum(saleLineTypes);
export const paymentMethods = ['CASH', 'PAYNOW', 'CARD', 'OTHER'] as const;
export const paymentMethodSchema = z.enum(paymentMethods);

const serviceLineRequestSchema = z.object({
  type: z.literal('SERVICE'),
  serviceId: idSchema,
  quantity: quantitySchema.default(1),
  staffProfileId: idSchema.nullish(),
  discountInCents: moneySchema.default(0),
});

const productLineRequestSchema = z.object({
  type: z.literal('PRODUCT'),
  productId: idSchema,
  quantity: quantitySchema.default(1),
  discountInCents: moneySchema.default(0),
});

export const saleLineRequestSchema = z.discriminatedUnion('type', [
  serviceLineRequestSchema,
  productLineRequestSchema,
]);

export const salePaymentRequestSchema = z.object({
  method: paymentMethodSchema,
  amountInCents: z.number().int().min(1).max(1_000_000_000),
  reference: z.string().trim().max(120).nullish(),
});

export const createSaleRequestSchema = z.object({
  locationId: idSchema,
  customerId: idSchema.nullish(),
  appointmentId: idSchema.nullish(),
  notes: z.string().trim().max(1000).nullish(),
  lines: z.array(saleLineRequestSchema).min(1).max(100),
  payments: z.array(salePaymentRequestSchema).min(1).max(10),
});

export const saleQuerySchema = z.object({
  locationId: idSchema.optional(),
  customerId: idSchema.optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  status: saleStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const voidSaleRequestSchema = z.object({
  reason: z.string().trim().min(1).max(255),
});

export const saleRefundLineRequestSchema = z.object({
  lineId: idSchema,
  quantity: quantitySchema,
});

export const createSaleRefundRequestSchema = z.object({
  amountInCents: z.number().int().min(1).max(1_000_000_000),
  method: paymentMethodSchema,
  reason: z.string().trim().min(1).max(500),
  reference: z.string().trim().max(120).nullish(),
  returns: z.array(saleRefundLineRequestSchema).max(100).default([]),
});

const actorSchema = z.object({
  id: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().min(1),
});

export const saleLineSummarySchema = z.object({
  id: z.string().min(1),
  type: saleLineTypeSchema,
  serviceId: z.string().nullable(),
  productId: z.string().nullable(),
  staffProfileId: z.string().nullable(),
  staff: staffProfileSummarySchema.nullable(),
  name: z.string().min(1),
  quantity: quantitySchema,
  unitPriceInCents: moneySchema,
  discountInCents: moneySchema,
  taxInCents: moneySchema,
  totalInCents: moneySchema,
  inventoryTracked: z.boolean(),
});

export const saleRefundLineSummarySchema = z.object({
  id: z.string().min(1),
  saleLineId: z.string().min(1),
  quantity: quantitySchema,
});

export const salePaymentSummarySchema = z.object({
  id: z.string().min(1),
  method: paymentMethodSchema,
  amountInCents: moneySchema,
  reference: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const saleRefundSummarySchema = z.object({
  id: z.string().min(1),
  amountInCents: moneySchema,
  method: paymentMethodSchema,
  reason: z.string().min(1),
  reference: z.string().nullable(),
  processedById: z.string().nullable(),
  processedBy: actorSchema.nullable(),
  createdAt: z.iso.datetime(),
  lines: z.array(saleRefundLineSummarySchema),
});

export const saleSummarySchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  locationId: z.string().min(1),
  receiptNumber: z.number().int().positive(),
  receiptCode: z.string().min(1),
  customerId: z.string().nullable(),
  appointmentId: z.string().nullable(),
  status: saleStatusSchema,
  subtotalInCents: moneySchema,
  discountInCents: moneySchema,
  taxInCents: moneySchema,
  totalInCents: moneySchema,
  paidInCents: moneySchema,
  refundedInCents: moneySchema,
  notes: z.string().nullable(),
  createdById: z.string().nullable(),
  createdBy: actorSchema.nullable(),
  voidedAt: z.iso.datetime().nullable(),
  voidReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  customer: customerSummarySchema.nullable(),
  location: locationSummarySchema,
  lines: z.array(saleLineSummarySchema),
  payments: z.array(salePaymentSummarySchema),
  refunds: z.array(saleRefundSummarySchema),
});

export const salesDataSchema = z.object({ sales: z.array(saleSummarySchema) });
export const saleDataSchema = z.object({ sale: saleSummarySchema });

export const saleStatusResponseSchema = apiEnvelopeSchema(saleDataSchema);
export const salesResponseSchema = apiEnvelopeSchema(salesDataSchema);

export type SaleStatus = z.infer<typeof saleStatusSchema>;
export type SaleLineType = z.infer<typeof saleLineTypeSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type SaleLineRequest = z.infer<typeof saleLineRequestSchema>;
export type SalePaymentRequest = z.infer<typeof salePaymentRequestSchema>;
export type CreateSaleRequest = z.infer<typeof createSaleRequestSchema>;
export type SaleQuery = z.infer<typeof saleQuerySchema>;
export type VoidSaleRequest = z.infer<typeof voidSaleRequestSchema>;
export type SaleRefundLineRequest = z.infer<typeof saleRefundLineRequestSchema>;
export type CreateSaleRefundRequest = z.infer<typeof createSaleRefundRequestSchema>;
export type SaleLineSummary = z.infer<typeof saleLineSummarySchema>;
export type SaleRefundLineSummary = z.infer<typeof saleRefundLineSummarySchema>;
export type SalePaymentSummary = z.infer<typeof salePaymentSummarySchema>;
export type SaleRefundSummary = z.infer<typeof saleRefundSummarySchema>;
export type SaleSummary = z.infer<typeof saleSummarySchema>;
