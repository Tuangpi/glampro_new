import type {
  BusinessHour,
  CreateLocationRequest,
  LocationDetail,
  OrganizationSettings,
  UpdateLocationRequest,
  UpdateOrganizationRequest,
} from '@glampro/contracts';
import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { type AuditContext, recordAuditEvent } from '../../shared/audit.js';
import { AppError } from '../../shared/http/app-error.js';

const organizationSelection = {
  id: true,
  name: true,
  slug: true,
  status: true,
  legalName: true,
  registrationNumber: true,
  gstRegistrationNumber: true,
  defaultCurrency: true,
  defaultTimezone: true,
  logoUrl: true,
} as const;

const locationSelection = {
  id: true,
  organizationId: true,
  name: true,
  code: true,
  phone: true,
  email: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  postalCode: true,
  countryCode: true,
  timezone: true,
  currency: true,
  pricesIncludeTax: true,
  receiptPrefix: true,
  nextReceiptNumber: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

type OrganizationRow = Prisma.OrganizationGetPayload<{ select: typeof organizationSelection }>;
type LocationRow = Prisma.LocationGetPayload<{ select: typeof locationSelection }>;

const toOrganizationSettings = (row: OrganizationRow): OrganizationSettings => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  status: row.status,
  legalName: row.legalName,
  registrationNumber: row.registrationNumber,
  gstRegistrationNumber: row.gstRegistrationNumber,
  defaultCurrency: row.defaultCurrency,
  defaultTimezone: row.defaultTimezone,
  logoUrl: row.logoUrl,
});

const toLocationDetail = (row: LocationRow): LocationDetail => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/** Mirrors registration's code derivation so generated codes stay consistent. */
const derivedLocationCode = (name: string) =>
  name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .replace(/^-+|-+$/g, '')
    .toUpperCase()
    .slice(0, 30) || 'MAIN';

/** Every location lookup is tenant-scoped, so a foreign ID surfaces as 404. */
const scopedLocationRow = async (organizationId: string, locationId: string) => {
  const location = await prisma.location.findFirst({
    where: { id: locationId, organizationId },
    select: locationSelection,
  });

  if (!location) {
    throw new AppError(404, 'NOT_FOUND', 'Location was not found');
  }

  return location;
};

const assertUniqueCode = async (
  organizationId: string,
  code: string,
  excludingLocationId: string | null,
) => {
  const existing = await prisma.location.findFirst({
    where: {
      organizationId,
      code,
      ...(excludingLocationId ? { id: { not: excludingLocationId } } : {}),
    },
    select: { id: true },
  });

  if (existing) {
    throw new AppError(409, 'CONFLICT', 'A location with this code already exists');
  }
};

/** Same defaults registration writes, so every location starts with a full week. */
const defaultBusinessHours = (locationId: string) =>
  Array.from({ length: 7 }, (_, dayOfWeek) => ({
    locationId,
    dayOfWeek,
    isClosed: dayOfWeek === 0,
    opensAt: dayOfWeek === 0 ? null : '09:00',
    closesAt: dayOfWeek === 0 ? null : dayOfWeek >= 6 ? '21:00' : '20:00',
  }));

export const organizationSettingsOf = async (
  organizationId: string,
): Promise<OrganizationSettings> => {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: organizationSelection,
  });

  if (!organization) {
    throw new AppError(404, 'NOT_FOUND', 'Organization was not found');
  }

  return toOrganizationSettings(organization);
};

export const updateOrganizationSettings = async (
  organizationId: string,
  input: UpdateOrganizationRequest,
  actorUserId: string,
  context: AuditContext,
): Promise<OrganizationSettings> => {
  const updated = await prisma.organization.update({
    where: { id: organizationId },
    data: {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.legalName === undefined ? {} : { legalName: input.legalName }),
      ...(input.registrationNumber === undefined
        ? {}
        : { registrationNumber: input.registrationNumber }),
      ...(input.gstRegistrationNumber === undefined
        ? {}
        : { gstRegistrationNumber: input.gstRegistrationNumber }),
      ...(input.defaultTimezone === undefined ? {} : { defaultTimezone: input.defaultTimezone }),
      ...(input.logoUrl === undefined ? {} : { logoUrl: input.logoUrl }),
    },
    select: organizationSelection,
  });

  await recordAuditEvent(context, {
    action: 'settings.organization_updated',
    actorType: 'USER',
    organizationId,
    actorUserId,
    entityType: 'Organization',
    entityId: organizationId,
    metadata: { fields: Object.keys(input) },
  });

  return toOrganizationSettings(updated);
};

export const listLocations = async (organizationId: string): Promise<LocationDetail[]> => {
  const locations = await prisma.location.findMany({
    where: { organizationId },
    select: locationSelection,
    orderBy: { name: 'asc' },
  });

  return locations.map(toLocationDetail);
};

export const locationDetailOf = async (
  organizationId: string,
  locationId: string,
): Promise<LocationDetail> => toLocationDetail(await scopedLocationRow(organizationId, locationId));

export const createLocation = async (
  organizationId: string,
  input: CreateLocationRequest,
  actorUserId: string,
  context: AuditContext,
): Promise<LocationDetail> => {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { defaultCurrency: true, defaultTimezone: true },
  });

  if (!organization) {
    throw new AppError(404, 'NOT_FOUND', 'Organization was not found');
  }

  const code = (input.code ?? derivedLocationCode(input.name)).toUpperCase();
  await assertUniqueCode(organizationId, code, null);

  const created = await prisma.$transaction(async (transaction) => {
    const location = await transaction.location.create({
      data: {
        organizationId,
        name: input.name,
        code,
        phone: input.phone ?? null,
        email: input.email ?? null,
        addressLine1: input.addressLine1 ?? null,
        addressLine2: input.addressLine2 ?? null,
        city: input.city ?? null,
        postalCode: input.postalCode ?? null,
        countryCode: input.countryCode?.toUpperCase() ?? 'SG',
        timezone: input.timezone ?? organization.defaultTimezone,
        currency: organization.defaultCurrency,
        pricesIncludeTax: input.pricesIncludeTax ?? true,
        receiptPrefix: input.receiptPrefix ?? 'SALE',
      },
      select: locationSelection,
    });

    await transaction.businessHour.createMany({ data: defaultBusinessHours(location.id) });
    return location;
  });

  await recordAuditEvent(context, {
    action: 'settings.location_created',
    actorType: 'USER',
    organizationId,
    actorUserId,
    entityType: 'Location',
    entityId: created.id,
    metadata: { code: created.code },
  });

  return toLocationDetail(created);
};

export const updateLocation = async (
  organizationId: string,
  locationId: string,
  input: UpdateLocationRequest,
  actorUserId: string,
  context: AuditContext,
): Promise<LocationDetail> => {
  const location = await scopedLocationRow(organizationId, locationId);
  const code = input.code === undefined ? undefined : input.code.toUpperCase();

  if (code !== undefined && code !== location.code) {
    await assertUniqueCode(organizationId, code, location.id);
  }

  const updated = await prisma.location.update({
    where: { id: location.id },
    data: {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(code === undefined ? {} : { code }),
      ...(input.phone === undefined ? {} : { phone: input.phone }),
      ...(input.email === undefined ? {} : { email: input.email }),
      ...(input.addressLine1 === undefined ? {} : { addressLine1: input.addressLine1 }),
      ...(input.addressLine2 === undefined ? {} : { addressLine2: input.addressLine2 }),
      ...(input.city === undefined ? {} : { city: input.city }),
      ...(input.postalCode === undefined ? {} : { postalCode: input.postalCode }),
      ...(input.countryCode === undefined ? {} : { countryCode: input.countryCode.toUpperCase() }),
      ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
      ...(input.pricesIncludeTax === undefined ? {} : { pricesIncludeTax: input.pricesIncludeTax }),
      ...(input.receiptPrefix === undefined ? {} : { receiptPrefix: input.receiptPrefix }),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
    },
    select: locationSelection,
  });

  await recordAuditEvent(context, {
    action: 'settings.location_updated',
    actorType: 'USER',
    organizationId,
    actorUserId,
    entityType: 'Location',
    entityId: location.id,
    metadata: { fields: Object.keys(input) },
  });

  return toLocationDetail(updated);
};

export const businessHoursOf = async (
  organizationId: string,
  locationId: string,
): Promise<BusinessHour[]> => {
  await scopedLocationRow(organizationId, locationId);

  const hours = await prisma.businessHour.findMany({
    where: { locationId },
    orderBy: { dayOfWeek: 'asc' },
  });

  return hours.map((hour) => ({
    dayOfWeek: hour.dayOfWeek,
    opensAt: hour.opensAt,
    closesAt: hour.closesAt,
    isClosed: hour.isClosed,
  }));
};

export const replaceBusinessHours = async (
  organizationId: string,
  locationId: string,
  hours: BusinessHour[],
  actorUserId: string,
  context: AuditContext,
): Promise<BusinessHour[]> => {
  const location = await scopedLocationRow(organizationId, locationId);

  await prisma.$transaction(
    hours.map((hour) =>
      prisma.businessHour.upsert({
        where: { locationId_dayOfWeek: { locationId: location.id, dayOfWeek: hour.dayOfWeek } },
        create: {
          locationId: location.id,
          dayOfWeek: hour.dayOfWeek,
          isClosed: hour.isClosed,
          opensAt: hour.isClosed ? null : hour.opensAt,
          closesAt: hour.isClosed ? null : hour.closesAt,
        },
        update: {
          isClosed: hour.isClosed,
          opensAt: hour.isClosed ? null : hour.opensAt,
          closesAt: hour.isClosed ? null : hour.closesAt,
        },
      }),
    ),
  );

  await recordAuditEvent(context, {
    action: 'settings.business_hours_updated',
    actorType: 'USER',
    organizationId,
    actorUserId,
    entityType: 'Location',
    entityId: location.id,
  });

  return businessHoursOf(organizationId, locationId);
};
