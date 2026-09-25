import { describe, expect, it } from 'vitest';
import {
  platformOrganizationActionRequestSchema,
  platformOrganizationQuerySchema,
  platformSubscriptionActionRequestSchema,
} from './platform.js';

describe('platform administration contracts', () => {
  it('coerces bounded organization queries', () => {
    expect(
      platformOrganizationQuerySchema.parse({ page: '2', pageSize: '10', status: 'ACTIVE' }),
    ).toMatchObject({ page: 2, pageSize: 10, status: 'ACTIVE' });
    expect(() => platformOrganizationQuerySchema.parse({ page: '0' })).toThrow();
  });

  it('requires a reason for every audited action', () => {
    expect(
      platformOrganizationActionRequestSchema.parse({ action: 'SUSPEND', reason: 'Manual review' }),
    ).toMatchObject({ action: 'SUSPEND', reason: 'Manual review' });
    expect(() =>
      platformOrganizationActionRequestSchema.parse({ action: 'SUSPEND', reason: '' }),
    ).toThrow();
    expect(
      platformSubscriptionActionRequestSchema.parse({ action: 'PAUSE', reason: 'Payment review' }),
    ).toMatchObject({ action: 'PAUSE' });
  });
});
