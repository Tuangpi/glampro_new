import type {
  CreateCustomerNoteRequest,
  CustomerDetail,
  CustomerNoteSummary,
  CustomerQuery,
  CustomerRequest,
  CustomerSummary,
  UpdateCustomerRequest,
} from '@glampro/contracts';
import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { type AuditContext, recordAuditEvent } from '../../shared/audit.js';
import { parseDateOnly, toDateOnly } from '../../shared/dates.js';
import { AppError } from '../../shared/http/app-error.js';

/**
 * Customer profiles.
 *
 * Every read and write is tenant-scoped through `organizationId`, so an ID from
 * another organization surfaces as `404`. Email, phone, and member number are
 * unique per organization when present, which keeps two tenants free to record
 * the same person. Notes are append-only, and visit history is not stored here:
 * it is derived from appointments and sales in later milestones.
 */

/** Exported so the appointment module can embed the same customer projection. */
export const customerSelection = {
  id: true,
  organizationId: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  dateOfBirth: true,
  gender: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  postalCode: true,
  countryCode: true,
  memberNumber: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

const noteSelection = {
  id: true,
  organizationId: true,
  customerId: true,
  body: true,
  createdAt: true,
  author: { select: { id: true, firstName: true, lastName: true, email: true } },
} as const;

/** Newest notes first, capped so a long history cannot bloat the detail read. */
const noteLimit = 100;

type CustomerRow = Prisma.CustomerGetPayload<{ select: typeof customerSelection }>;
type NoteRow = Prisma.CustomerNoteGetPayload<{ select: typeof noteSelection }>;

/** Exported so the appointment module can project the same customer shape. */
export type { CustomerRow };

/** `DATE` columns are date-only, so they travel as `YYYY-MM-DD`. */
export const toCustomer = (row: CustomerRow): CustomerSummary => ({
  ...row,
  dateOfBirth: toDateOnly(row.dateOfBirth),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const toCustomerNote = (row: NoteRow): CustomerNoteSummary => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
});

type UniqueCustomerField = 'email' | 'phone' | 'memberNumber';

/**
 * Email, phone, and member number are unique per tenant when present. Checking
 * before the write turns a duplicate into `409 CONFLICT` with a single message
 * instead of leaking which database constraint failed.
 */
const assertUniqueCustomerFields = async (
  organizationId: string,
  fields: Partial<Record<UniqueCustomerField, string | null | undefined>>,
  excludingCustomerId: string | null,
) => {
  const clauses = (['email', 'phone', 'memberNumber'] as const)
    .filter((field) => fields[field] !== undefined && fields[field] !== null)
    .map((field) => ({ [field]: fields[field] as string }));

  if (clauses.length === 0) {
    return;
  }

  const existing = await prisma.customer.findFirst({
    where: {
      organizationId,
      ...(excludingCustomerId ? { id: { not: excludingCustomerId } } : {}),
      OR: clauses,
    },
    select: { id: true },
  });

  if (existing) {
    throw new AppError(
      409,
      'CONFLICT',
      'Another customer already uses that email, phone, or member number',
    );
  }
};

const scopedCustomerRow = async (
  organizationId: string,
  customerId: string,
): Promise<CustomerRow> => {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId },
    select: customerSelection,
  });

  if (!customer) {
    throw new AppError(404, 'NOT_FOUND', 'Customer was not found');
  }

  return customer;
};

/**
 * Search runs against the natural keys a receptionist would have at hand. The
 * MySQL collation is case-insensitive, so `contains` already ignores case.
 */
export const listCustomers = async (
  organizationId: string,
  query: CustomerQuery,
): Promise<CustomerSummary[]> => {
  const customers = await prisma.customer.findMany({
    where: {
      organizationId,
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.q
        ? {
            OR: [
              { firstName: { contains: query.q } },
              { lastName: { contains: query.q } },
              { email: { contains: query.q } },
              { phone: { contains: query.q } },
              { memberNumber: { contains: query.q } },
            ],
          }
        : {}),
    },
    select: customerSelection,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: query.limit,
  });

  return customers.map(toCustomer);
};

export const customerDetailOf = async (
  organizationId: string,
  customerId: string,
): Promise<CustomerDetail> => {
  const customer = await scopedCustomerRow(organizationId, customerId);
  const notes = await prisma.customerNote.findMany({
    where: { organizationId, customerId: customer.id },
    select: noteSelection,
    orderBy: { createdAt: 'desc' },
    take: noteLimit,
  });

  return { ...toCustomer(customer), notes: notes.map(toCustomerNote) };
};

export const listCustomerNotes = async (
  organizationId: string,
  customerId: string,
): Promise<CustomerNoteSummary[]> => {
  const customer = await scopedCustomerRow(organizationId, customerId);
  const notes = await prisma.customerNote.findMany({
    where: { organizationId, customerId: customer.id },
    select: noteSelection,
    orderBy: { createdAt: 'desc' },
    take: noteLimit,
  });

  return notes.map(toCustomerNote);
};

export const createCustomer = async (
  organizationId: string,
  input: CustomerRequest,
  actorUserId: string,
  context: AuditContext,
): Promise<CustomerSummary> => {
  await assertUniqueCustomerFields(
    organizationId,
    { email: input.email, phone: input.phone, memberNumber: input.memberNumber },
    null,
  );

  const created = await prisma.customer.create({
    data: {
      organizationId,
      firstName: input.firstName,
      lastName: input.lastName ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      dateOfBirth: parseDateOnly(input.dateOfBirth ?? null),
      gender: input.gender ?? null,
      addressLine1: input.addressLine1 ?? null,
      addressLine2: input.addressLine2 ?? null,
      city: input.city ?? null,
      postalCode: input.postalCode ?? null,
      ...(input.countryCode === undefined ? {} : { countryCode: input.countryCode.toUpperCase() }),
      memberNumber: input.memberNumber ?? null,
      isActive: input.isActive,
    },
    select: customerSelection,
  });

  await recordAuditEvent(context, {
    action: 'customer.created',
    actorType: 'USER',
    organizationId,
    actorUserId,
    entityType: 'Customer',
    entityId: created.id,
    metadata: { firstName: created.firstName, lastName: created.lastName },
  });

  return toCustomer(created);
};

export const updateCustomer = async (
  organizationId: string,
  customerId: string,
  input: UpdateCustomerRequest,
  actorUserId: string,
  context: AuditContext,
): Promise<CustomerSummary> => {
  const customer = await scopedCustomerRow(organizationId, customerId);

  await assertUniqueCustomerFields(
    organizationId,
    { email: input.email, phone: input.phone, memberNumber: input.memberNumber },
    customer.id,
  );

  const updated = await prisma.customer.update({
    where: { id: customer.id },
    data: {
      ...(input.firstName === undefined ? {} : { firstName: input.firstName }),
      ...(input.lastName === undefined ? {} : { lastName: input.lastName }),
      ...(input.email === undefined ? {} : { email: input.email }),
      ...(input.phone === undefined ? {} : { phone: input.phone }),
      ...(input.dateOfBirth === undefined ? {} : { dateOfBirth: parseDateOnly(input.dateOfBirth) }),
      ...(input.gender === undefined ? {} : { gender: input.gender }),
      ...(input.addressLine1 === undefined ? {} : { addressLine1: input.addressLine1 }),
      ...(input.addressLine2 === undefined ? {} : { addressLine2: input.addressLine2 }),
      ...(input.city === undefined ? {} : { city: input.city }),
      ...(input.postalCode === undefined ? {} : { postalCode: input.postalCode }),
      ...(input.countryCode === undefined ? {} : { countryCode: input.countryCode.toUpperCase() }),
      ...(input.memberNumber === undefined ? {} : { memberNumber: input.memberNumber }),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
    },
    select: customerSelection,
  });

  await recordAuditEvent(context, {
    action: 'customer.updated',
    actorType: 'USER',
    organizationId,
    actorUserId,
    entityType: 'Customer',
    entityId: customer.id,
    metadata: { fields: Object.keys(input) },
  });

  return toCustomer(updated);
};

/**
 * Notes are appended, never edited, so the profile keeps an honest timeline of
 * who recorded what and when.
 */
export const createCustomerNote = async (
  organizationId: string,
  customerId: string,
  input: CreateCustomerNoteRequest,
  actorUserId: string,
  context: AuditContext,
): Promise<CustomerNoteSummary> => {
  const customer = await scopedCustomerRow(organizationId, customerId);

  const created = await prisma.customerNote.create({
    data: {
      organizationId,
      customerId: customer.id,
      authorUserId: actorUserId,
      body: input.body,
    },
    select: noteSelection,
  });

  await recordAuditEvent(context, {
    action: 'customer.note_added',
    actorType: 'USER',
    organizationId,
    actorUserId,
    entityType: 'CustomerNote',
    entityId: created.id,
    metadata: { customerId: customer.id },
  });

  return toCustomerNote(created);
};
