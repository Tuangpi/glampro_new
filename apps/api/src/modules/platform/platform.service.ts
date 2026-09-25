import type {
  PlatformOrganizationActionRequest,
  PlatformOrganizationPage,
  PlatformOrganizationQuery,
  PlatformOrganizationSummary,
  PlatformOverview,
  PlatformSubscriptionActionRequest,
} from '@glampro/contracts';
import { prisma } from '../../database/prisma.js';
import type {
  OrganizationStatus,
  Prisma,
  SubscriptionStatus,
} from '../../generated/prisma/client.js';
import { recordAuditEvent, type AuditContext } from '../../shared/audit.js';
import { AppError } from '../../shared/http/app-error.js';
import {
  applyStripeSubscription,
  isStripeSecretConfigured,
  manageStripeSubscription,
  subscriptionSummaryOf,
} from '../billing/billing.service.js';

const organizationSelection = {
  id: true,
  name: true,
  slug: true,
  status: true,
  defaultCurrency: true,
  defaultTimezone: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { memberships: true, locations: { where: { isActive: true } } } },
  subscriptions: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: {
      id: true,
      organizationId: true,
      provider: true,
      providerCustomerId: true,
      providerSubscriptionId: true,
      planCode: true,
      status: true,
      trialEndsAt: true,
      currentPeriodStartsAt: true,
      currentPeriodEndsAt: true,
      cancelledAt: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} as const;

type OrganizationRow = Prisma.OrganizationGetPayload<{ select: typeof organizationSelection }>;

const toSummary = (row: OrganizationRow): PlatformOrganizationSummary => {
  const subscription = row.subscriptions[0];
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    currency: row.defaultCurrency,
    timezone: row.defaultTimezone,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    memberCount: row._count.memberships,
    activeLocationCount: row._count.locations,
    subscription: subscription ? subscriptionSummaryOf(subscription) : null,
  };
};

const organizationById = async (organizationId: string) => {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: organizationSelection,
  });
  if (!organization) {
    throw new AppError(404, 'NOT_FOUND', 'Organization was not found');
  }
  return organization;
};
export const listPlatformOrganizations = async (
  query: PlatformOrganizationQuery,
): Promise<PlatformOrganizationPage> => {
  const where: Prisma.OrganizationWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.q ? { OR: [{ name: { contains: query.q } }, { slug: { contains: query.q } }] } : {}),
    ...(query.subscriptionStatus
      ? { subscriptions: { some: { status: query.subscriptionStatus } } }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.organization.count({ where }),
    prisma.organization.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: organizationSelection,
    }),
  ]);
  return { organizations: rows.map(toSummary), page: query.page, pageSize: query.pageSize, total };
};

export const platformOverview = async (): Promise<PlatformOverview> => {
  const [rows, statusCounts, trialing, active, pastDue, paused, incomplete, cancelled, total] =
    await Promise.all([
      prisma.organization.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: organizationSelection,
      }),
      prisma.organization.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.subscription.count({ where: { status: 'TRIALING' } }),
      prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      prisma.subscription.count({ where: { status: 'PAST_DUE' } }),
      prisma.subscription.count({ where: { status: 'PAUSED' } }),
      prisma.subscription.count({ where: { status: 'INCOMPLETE' } }),
      prisma.subscription.count({ where: { status: 'CANCELLED' } }),
      prisma.organization.count(),
    ]);
  const count = (status: OrganizationStatus) =>
    statusCounts.find((entry) => entry.status === status)?._count._all ?? 0;
  return {
    organizations: {
      total,
      trial: count('TRIAL'),
      active: count('ACTIVE'),
      pastDue: count('PAST_DUE'),
      suspended: count('SUSPENDED'),
      cancelled: count('CANCELLED'),
    },
    subscriptions: { trialing, active, pastDue, paused, incomplete, cancelled },
    recentOrganizations: rows.map(toSummary),
  };
};

const organizationStatusForAction = (
  action: PlatformOrganizationActionRequest['action'],
): OrganizationStatus => {
  if (action === 'SUSPEND') return 'SUSPENDED';
  if (action === 'CANCEL') return 'CANCELLED';
  return 'ACTIVE';
};

export const changePlatformOrganizationStatus = async (
  organizationId: string,
  input: PlatformOrganizationActionRequest,
  actorUserId: string,
  context: AuditContext,
): Promise<PlatformOrganizationSummary> => {
  const organization = await organizationById(organizationId);
  const status = organizationStatusForAction(input.action);
  await prisma.organization.update({ where: { id: organizationId }, data: { status } });
  const updated = await organizationById(organizationId);
  await recordAuditEvent(context, {
    action: 'platform.organization_status_changed',
    actorType: 'PLATFORM_ADMIN',
    organizationId,
    actorUserId,
    entityType: 'Organization',
    entityId: organizationId,
    metadata: { from: organization.status, to: status, reason: input.reason },
  });
  return toSummary(updated);
};

const subscriptionStatusForAction = (
  action: PlatformSubscriptionActionRequest['action'],
): SubscriptionStatus => {
  if (action === 'PAUSE') return 'PAUSED';
  if (action === 'CANCEL') return 'CANCELLED';
  return 'ACTIVE';
};

export const changePlatformSubscriptionStatus = async (
  organizationId: string,
  input: PlatformSubscriptionActionRequest,
  actorUserId: string,
  context: AuditContext,
) => {
  const organization = await organizationById(organizationId);
  const subscription = organization.subscriptions[0];
  if (!subscription) {
    throw new AppError(404, 'NOT_FOUND', 'Subscription was not found');
  }
  const status = subscriptionStatusForAction(input.action);
  if (subscription.providerSubscriptionId && isStripeSecretConfigured()) {
    const stripeSubscription = await manageStripeSubscription(
      subscription.providerSubscriptionId,
      input.action,
    );
    await applyStripeSubscription(stripeSubscription);
  } else {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status, cancelledAt: status === 'CANCELLED' ? new Date() : null },
    });
  }

  const updatedSubscription = await prisma.subscription.findUniqueOrThrow({
    where: { id: subscription.id },
    select: {
      id: true,
      organizationId: true,
      provider: true,
      providerCustomerId: true,
      providerSubscriptionId: true,
      planCode: true,
      status: true,
      trialEndsAt: true,
      currentPeriodStartsAt: true,
      currentPeriodEndsAt: true,
      cancelledAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const effectiveSubscriptionStatus =
    updatedSubscription.status === 'ACTIVE' || updatedSubscription.status === 'TRIALING'
      ? 'ACTIVE'
      : updatedSubscription.status === 'PAST_DUE'
        ? 'PAST_DUE'
        : updatedSubscription.status === 'PAUSED'
          ? 'SUSPENDED'
          : 'CANCELLED';
  await prisma.organization.update({
    where: { id: organizationId },
    data: { status: effectiveSubscriptionStatus },
  });
  await recordAuditEvent(context, {
    action: 'platform.subscription_status_changed',
    actorType: 'PLATFORM_ADMIN',
    organizationId,
    actorUserId,
    entityType: 'Subscription',
    entityId: subscription.id,
    metadata: { from: subscription.status, to: status, reason: input.reason },
  });
  return subscriptionSummaryOf(updatedSubscription);
};
