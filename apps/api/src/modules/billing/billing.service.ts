import type {
  BillingSummary,
  CheckoutData,
  CustomerPortalData,
  SubscriptionSummary,
} from '@glampro/contracts';
import Stripe from 'stripe';
import { env } from '../../config/env.js';
import { prisma } from '../../database/prisma.js';
import type {
  OrganizationStatus,
  Prisma,
  SubscriptionStatus,
} from '../../generated/prisma/client.js';
import { recordAuditEvent, type AuditContext } from '../../shared/audit.js';
import { AppError } from '../../shared/http/app-error.js';

const subscriptionSelection = {
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
} as const;

type SubscriptionRow = Prisma.SubscriptionGetPayload<{ select: typeof subscriptionSelection }>;

let stripeClient: Stripe | undefined;

const stripeIsConfigured = Boolean(
  env.STRIPE_SECRET_KEY &&
  env.STRIPE_WEBHOOK_SECRET &&
  env.STRIPE_STARTER_PRICE_ID &&
  env.STRIPE_BILLING_RETURN_URL,
);
const stripeCheckoutIsConfigured = stripeIsConfigured;

export const isStripeConfigured = () => stripeIsConfigured;
export const isStripeCheckoutConfigured = () => stripeCheckoutIsConfigured;
export const isStripeSecretConfigured = () => Boolean(env.STRIPE_SECRET_KEY);

const getStripe = (): Stripe => {
  if (!env.STRIPE_SECRET_KEY) {
    throw new AppError(503, 'BILLING_NOT_CONFIGURED', 'Stripe Billing is not configured');
  }

  stripeClient ??= new Stripe(env.STRIPE_SECRET_KEY, { typescript: true });
  return stripeClient;
};

const dateFromUnix = (value: number | null | undefined) =>
  typeof value === 'number' ? new Date(value * 1000) : null;

const toSubscriptionSummary = (row: SubscriptionRow): SubscriptionSummary => ({
  id: row.id,
  organizationId: row.organizationId,
  provider: row.provider,
  planCode: row.planCode,
  status: row.status,
  trialEndsAt: row.trialEndsAt?.toISOString() ?? null,
  currentPeriodStartsAt: row.currentPeriodStartsAt?.toISOString() ?? null,
  currentPeriodEndsAt: row.currentPeriodEndsAt?.toISOString() ?? null,
  cancelledAt: row.cancelledAt?.toISOString() ?? null,
  hasStripeCustomer: Boolean(row.providerCustomerId),
  hasStripeSubscription: Boolean(row.providerSubscriptionId),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export const subscriptionSummaryOf = toSubscriptionSummary;

const latestSubscriptionOf = async (organizationId: string) =>
  prisma.subscription.findFirst({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    select: subscriptionSelection,
  });

const organizationForBilling = async (organizationId: string) => {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, status: true },
  });

  if (!organization) {
    throw new AppError(404, 'NOT_FOUND', 'Organization was not found');
  }

  return organization;
};

const returnUrlWithParameter = (parameter: 'success' | 'cancel') => {
  if (!env.STRIPE_BILLING_RETURN_URL) {
    throw new AppError(503, 'BILLING_NOT_CONFIGURED', 'Stripe Billing is not configured');
  }

  const url = new URL(env.STRIPE_BILLING_RETURN_URL);
  url.searchParams.set('checkout', parameter);
  return url.toString();
};

const ownerContactOf = async (organizationId: string) => {
  const membership = await prisma.organizationMembership.findFirst({
    where: { organizationId, role: 'ORG_OWNER', status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    select: { user: { select: { email: true, firstName: true, lastName: true } } },
  });

  return membership?.user ?? null;
};

export const createCheckoutSession = async (
  organizationId: string,
  actorUserId: string,
  context: AuditContext,
): Promise<CheckoutData> => {
  if (!stripeCheckoutIsConfigured) {
    throw new AppError(503, 'BILLING_NOT_CONFIGURED', 'Stripe Billing is not configured');
  }

  const stripe = getStripe();
  const [subscription, owner] = await Promise.all([
    latestSubscriptionOf(organizationId),
    ownerContactOf(organizationId),
  ]);

  if (
    subscription?.providerSubscriptionId &&
    ['TRIALING', 'ACTIVE', 'PAST_DUE'].includes(subscription.status)
  ) {
    throw new AppError(409, 'CONFLICT', 'This organization already has an active subscription');
  }

  let customerId = subscription?.providerCustomerId ?? null;
  if (!customerId) {
    if (!owner) {
      throw new AppError(
        409,
        'BILLING_ACTION_UNAVAILABLE',
        'An organization owner is required for billing',
      );
    }

    const customer = await stripe.customers.create({
      email: owner.email,
      name: `${owner.firstName} ${owner.lastName}`.trim(),
      metadata: { organizationId },
    });
    customerId = customer.id;
  }

  const priceId = env.STRIPE_STARTER_PRICE_ID;
  if (!priceId) {
    throw new AppError(503, 'BILLING_NOT_CONFIGURED', 'Stripe Billing is not configured');
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: organizationId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: returnUrlWithParameter('success'),
    cancel_url: returnUrlWithParameter('cancel'),
    metadata: { organizationId, planCode: 'starter' },
    subscription_data: { metadata: { organizationId, planCode: 'starter' } },
  });

  if (session.url === null) {
    throw new AppError(502, 'BILLING_ACTION_UNAVAILABLE', 'Stripe did not return a checkout URL');
  }

  if (subscription) {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { providerCustomerId: customerId },
    });
  } else {
    await prisma.subscription.create({
      data: {
        organizationId,
        providerCustomerId: customerId,
        planCode: 'starter',
        status: 'INCOMPLETE',
      },
    });
  }

  await recordAuditEvent(context, {
    action: 'billing.checkout_created',
    actorType: 'USER',
    organizationId,
    actorUserId,
    entityType: 'Organization',
    entityId: organizationId,
    metadata: { checkoutSessionId: session.id },
  });

  return { sessionId: session.id, checkoutUrl: session.url };
};

export const createCustomerPortalSession = async (
  organizationId: string,
  actorUserId: string,
  context: AuditContext,
): Promise<CustomerPortalData> => {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_BILLING_RETURN_URL) {
    throw new AppError(503, 'BILLING_NOT_CONFIGURED', 'Stripe Billing is not configured');
  }

  const subscription = await latestSubscriptionOf(organizationId);
  if (!subscription?.providerCustomerId) {
    throw new AppError(
      409,
      'BILLING_ACTION_UNAVAILABLE',
      'No Stripe customer is linked to this organization',
    );
  }

  const session = await getStripe().billingPortal.sessions.create({
    customer: subscription.providerCustomerId,
    return_url: env.STRIPE_BILLING_RETURN_URL,
  });

  await recordAuditEvent(context, {
    action: 'billing.portal_session_created',
    actorType: 'USER',
    organizationId,
    actorUserId,
    entityType: 'Subscription',
    entityId: subscription.id,
    metadata: { portalSessionId: session.id },
  });

  return { sessionId: session.id, portalUrl: session.url };
};

export const getBillingSummary = async (organizationId: string): Promise<BillingSummary> => {
  const [organization, subscription] = await Promise.all([
    organizationForBilling(organizationId),
    latestSubscriptionOf(organizationId),
  ]);

  return {
    subscription: subscription ? toSubscriptionSummary(subscription) : null,
    stripeConfigured: stripeIsConfigured,
    checkoutEnabled: stripeCheckoutIsConfigured,
    customerPortalEnabled: stripeIsConfigured,
    organizationStatus: organization.status,
  };
};

const stripeStatus = (subscription: Stripe.Subscription): SubscriptionStatus => {
  if (subscription.pause_collection) {
    return 'PAUSED';
  }

  switch (subscription.status) {
    case 'trialing':
      return 'TRIALING';
    case 'active':
      return 'ACTIVE';
    case 'past_due':
    case 'unpaid':
      return 'PAST_DUE';
    case 'paused':
      return 'PAUSED';
    case 'canceled':
    case 'incomplete_expired':
      return 'CANCELLED';
    default:
      return 'INCOMPLETE';
  }
};

const organizationStatus = (status: SubscriptionStatus): OrganizationStatus => {
  switch (status) {
    case 'TRIALING':
      return 'TRIAL';
    case 'ACTIVE':
      return 'ACTIVE';
    case 'PAST_DUE':
      return 'PAST_DUE';
    case 'CANCELLED':
      return 'CANCELLED';
    case 'PAUSED':
    case 'INCOMPLETE':
      return 'SUSPENDED';
  }
};

const subscriptionPeriod = (subscription: Stripe.Subscription) => {
  const item = subscription.items.data[0];
  return {
    startsAt: dateFromUnix(item?.current_period_start),
    endsAt: dateFromUnix(item?.current_period_end),
  };
};

const applySubscription = async (subscription: Stripe.Subscription): Promise<string | null> => {
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  const organizationId = subscription.metadata.organizationId;
  const status = stripeStatus(subscription);
  const period = subscriptionPeriod(subscription);
  const existing = await prisma.subscription.findFirst({
    where: {
      OR: [
        { providerSubscriptionId: subscription.id },
        ...(organizationId ? [{ organizationId }] : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, organizationId: true, planCode: true },
  });

  const resolvedOrganizationId = existing?.organizationId ?? organizationId;
  if (!resolvedOrganizationId) {
    return null;
  }

  const data = {
    provider: 'stripe',
    providerCustomerId: customerId,
    providerSubscriptionId: subscription.id,
    planCode: subscription.metadata.planCode || existing?.planCode || 'starter',
    status,
    trialEndsAt: dateFromUnix(subscription.trial_end),
    currentPeriodStartsAt: period.startsAt,
    currentPeriodEndsAt: period.endsAt,
    cancelledAt:
      status === 'CANCELLED' ? (dateFromUnix(subscription.canceled_at) ?? new Date()) : null,
  };

  if (existing) {
    await prisma.$transaction([
      prisma.subscription.update({ where: { id: existing.id }, data }),
      prisma.organization.update({
        where: { id: resolvedOrganizationId },
        data: { status: organizationStatus(status) },
      }),
    ]);
  } else {
    await prisma.$transaction([
      prisma.subscription.create({ data: { organizationId: resolvedOrganizationId, ...data } }),
      prisma.organization.update({
        where: { id: resolvedOrganizationId },
        data: { status: organizationStatus(status) },
      }),
    ]);
  }

  return resolvedOrganizationId;
};

export const applyStripeSubscription = applySubscription;

export const applyCheckoutSession = async (
  session: Stripe.Checkout.Session,
): Promise<string | null> => {
  const organizationId = session.metadata?.organizationId ?? session.client_reference_id;
  if (!organizationId) {
    return null;
  }

  const customerId =
    typeof session.customer === 'string' ? session.customer : (session.customer?.id ?? null);
  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : (session.subscription?.id ?? null);
  const existing = await prisma.subscription.findFirst({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });

  if (existing) {
    const updateData: Prisma.SubscriptionUpdateInput = {
      planCode: session.metadata?.planCode ?? 'starter',
      providerCustomerId: customerId,
      providerSubscriptionId: subscriptionId,
    };
    await prisma.subscription.update({ where: { id: existing.id }, data: updateData });
  } else {
    await prisma.subscription.create({
      data: {
        organizationId,
        providerCustomerId: customerId,
        providerSubscriptionId: subscriptionId,
        planCode: session.metadata?.planCode ?? 'starter',
        status: 'INCOMPLETE',
      },
    });
  }

  return organizationId;
};

const isUniqueConstraintError = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';

export const processStripeEvent = async (
  event: Stripe.Event,
  context: AuditContext,
): Promise<{ duplicate: boolean }> => {
  try {
    // Claim the event before applying side effects. A unique-key collision means
    // another delivery already owns this event, so Stripe can safely retry it.
    await prisma.stripeWebhookEvent.create({
      data: { eventId: event.id, type: event.type },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { duplicate: true };
    }
    throw error;
  }

  try {
    let organizationId: string | null = null;
    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted' ||
      event.type === 'customer.subscription.paused' ||
      event.type === 'customer.subscription.resumed'
    ) {
      organizationId = await applySubscription(event.data.object as Stripe.Subscription);
    } else if (event.type === 'checkout.session.completed') {
      organizationId = await applyCheckoutSession(event.data.object as Stripe.Checkout.Session);
    } else if (event.type === 'invoice.payment_failed' || event.type === 'invoice.paid') {
      const invoice = event.data.object as Stripe.Invoice & {
        subscription?: string | { id: string } | null;
      };
      const subscriptionReference =
        invoice.parent?.subscription_details?.subscription ?? invoice.subscription;
      const subscriptionId =
        typeof subscriptionReference === 'string'
          ? subscriptionReference
          : subscriptionReference?.id;
      if (subscriptionId) {
        organizationId = await applySubscription(
          await getStripe().subscriptions.retrieve(subscriptionId),
        );
      }
    }

    await recordAuditEvent(context, {
      action: 'billing.webhook_processed',
      actorType: 'WEBHOOK',
      organizationId,
      entityType: 'StripeWebhookEvent',
      entityId: event.id,
      metadata: { eventType: event.type },
    });

    return { duplicate: false };
  } catch (error) {
    // If processing fails, release the claim so Stripe can retry the event.
    await prisma.stripeWebhookEvent.delete({ where: { eventId: event.id } }).catch(() => undefined);
    throw error;
  }
};

export const manageStripeSubscription = async (
  providerSubscriptionId: string,
  action: 'PAUSE' | 'RESUME' | 'CANCEL',
): Promise<Stripe.Subscription> => {
  const stripe = getStripe();
  if (action === 'PAUSE') {
    return stripe.subscriptions.update(providerSubscriptionId, {
      pause_collection: { behavior: 'keep_as_draft' },
    });
  }
  if (action === 'RESUME') {
    return stripe.subscriptions.resume(providerSubscriptionId);
  }
  return stripe.subscriptions.cancel(providerSubscriptionId, {
    cancellation_details: { comment: 'Cancelled by GlamPro platform administration' },
  });
};

export const constructStripeEvent = (payload: Buffer, signature: string): Stripe.Event => {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    throw new AppError(503, 'BILLING_NOT_CONFIGURED', 'Stripe Billing is not configured');
  }

  try {
    return getStripe().webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    throw new AppError(
      400,
      'STRIPE_SIGNATURE_INVALID',
      'Stripe webhook signature verification failed',
    );
  }
};
