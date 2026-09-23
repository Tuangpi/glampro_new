import type { MembershipRole } from '../../generated/prisma/client.js';
import { describe, expect, it } from 'vitest';
import { roleHasPermission } from './authorization.js';

describe('roleHasPermission', () => {
  it('allows organization owners to manage billing', () => {
    expect(roleHasPermission('ORG_OWNER', 'billing.manage')).toBe(true);
  });

  it('prevents staff from issuing refunds', () => {
    const role: MembershipRole = 'STAFF';
    expect(roleHasPermission(role, 'sales.refund')).toBe(false);
  });
});
