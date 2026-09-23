import { describe, expect, it } from 'vitest';
import {
  locationSummarySchema,
  membershipRoleSchema,
  membershipRoles,
  membershipSummarySchema,
  organizationStatusSchema,
} from './organization.js';

describe('organization contracts', () => {
  it('parses every declared membership role', () => {
    for (const role of membershipRoles) {
      expect(membershipRoleSchema.parse(role)).toBe(role);
    }
  });

  it('rejects an unknown organization status', () => {
    expect(() => organizationStatusSchema.parse('ARCHIVED')).toThrow();
  });

  it('parses a membership summary with its organization', () => {
    const parsed = membershipSummarySchema.parse({
      id: 'membership_1',
      organizationId: 'org_1',
      role: 'MANAGER',
      status: 'ACTIVE',
      organization: {
        id: 'org_1',
        name: 'Eurosense Hair Studio',
        slug: 'eurosense-hair-studio',
        status: 'ACTIVE',
        currency: 'SGD',
        timezone: 'Asia/Singapore',
      },
    });

    expect(parsed.role).toBe('MANAGER');
    expect(parsed.organization.currency).toBe('SGD');
  });

  it('parses a location summary', () => {
    const parsed = locationSummarySchema.parse({
      id: 'location_1',
      organizationId: 'org_1',
      name: 'Tanjong Pagar',
      code: 'TPG',
      timezone: 'Asia/Singapore',
      currency: 'SGD',
      isActive: true,
    });

    expect(parsed.isActive).toBe(true);
  });
});
