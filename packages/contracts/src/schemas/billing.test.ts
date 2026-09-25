import { describe, expect, it } from 'vitest';
import { billingSummarySchema, checkoutDataSchema, customerPortalDataSchema } from './billing.js';

describe('billing contracts', () => {
  it('parses a tenant-safe billing summary without provider identifiers', () => {
    const parsed = billingSummarySchema.parse({
      subscription: {
        id: 'sub_1',
        organizationId: 'org_1',
        provider: 'stripe',
        planCode: 'starter',
        status: 'TRIALING',
        trialEndsAt: '2026-10-01T00:00:00.000Z',
        currentPeriodStartsAt: null,
        currentPeriodEndsAt: null,
        cancelledAt: null,
        hasStripeCustomer: false,
        hasStripeSubscription: false,
        createdAt: '2026-09-24T00:00:00.000Z',
        updatedAt: '2026-09-24T00:00:00.000Z',
      },
      stripeConfigured: false,
      checkoutEnabled: false,
      customerPortalEnabled: false,
      organizationStatus: 'TRIAL',
    });

    expect(parsed.subscription?.hasStripeCustomer).toBe(false);
    expect(parsed.subscription).not.toHaveProperty('providerCustomerId');
  });

  it('requires hosted Stripe URLs for checkout and portal responses', () => {
    expect(() =>
      checkoutDataSchema.parse({ sessionId: 'cs_1', checkoutUrl: 'not-a-url' }),
    ).toThrow();
    expect(() =>
      customerPortalDataSchema.parse({ sessionId: 'bps_1', portalUrl: 'not-a-url' }),
    ).toThrow();
  });
});
