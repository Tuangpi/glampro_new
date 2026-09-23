import { describe, expect, it } from 'vitest';
import {
  authenticatedSessionDataSchema,
  loginRequestSchema,
  registrationRequestSchema,
  resetPasswordRequestSchema,
} from './auth.js';

describe('registrationRequestSchema', () => {
  it('normalizes valid registration input', () => {
    const result = registrationRequestSchema.parse({
      firstName: ' Kai ',
      lastName: ' Tan ',
      email: ' OWNER@EXAMPLE.COM ',
      password: 'SecurePassword123',
      organizationName: 'Eurosense Hair Studio',
      locationName: 'Tanjong Pagar',
    });

    expect(result.email).toBe('owner@example.com');
    expect(result.timezone).toBe('Asia/Singapore');
  });

  it('rejects weak passwords', () => {
    expect(() =>
      registrationRequestSchema.parse({
        firstName: 'Kai',
        lastName: 'Tan',
        email: 'owner@example.com',
        password: 'password',
        organizationName: 'Eurosense Hair Studio',
        locationName: 'Tanjong Pagar',
      }),
    ).toThrow();
  });
});

describe('loginRequestSchema', () => {
  it('normalizes the email address before authentication', () => {
    const result = loginRequestSchema.parse({
      email: ' OWNER@SALON.COM ',
      password: 'SecurePassword123',
    });

    expect(result.email).toBe('owner@salon.com');
  });

  it('rejects a blank password', () => {
    expect(() => loginRequestSchema.parse({ email: 'owner@salon.com', password: '' })).toThrow();
  });
});

describe('resetPasswordRequestSchema', () => {
  it('requires a token and a password that satisfies the policy', () => {
    expect(() =>
      resetPasswordRequestSchema.parse({ token: 'reset-token', password: 'weakpassword' }),
    ).toThrow();

    expect(
      resetPasswordRequestSchema.parse({ token: 'reset-token', password: 'SecurePassword123' })
        .token,
    ).toBe('reset-token');
  });
});

describe('authenticatedSessionDataSchema', () => {
  it('parses a session payload with organizations and permissions', () => {
    const parsed = authenticatedSessionDataSchema.parse({
      user: {
        id: 'user_1',
        email: 'owner@salon.com',
        firstName: 'Kai',
        lastName: 'Tan',
        avatarUrl: null,
        platformRole: 'USER',
        emailVerifiedAt: '2026-09-23T02:00:00.000Z',
      },
      accessToken: 'access-token',
      accessTokenExpiresAt: '2026-09-23T02:15:00.000Z',
      organizations: [
        {
          id: 'membership_1',
          organizationId: 'org_1',
          role: 'ORG_OWNER',
          status: 'ACTIVE',
          organization: {
            id: 'org_1',
            name: 'Eurosense Hair Studio',
            slug: 'eurosense-hair-studio',
            status: 'TRIAL',
            currency: 'SGD',
            timezone: 'Asia/Singapore',
          },
        },
      ],
      activeOrganizationId: 'org_1',
      permissions: ['sales.create', 'sales.read'],
      csrfToken: 'csrf-token',
    });

    expect(parsed.organizations[0]?.role).toBe('ORG_OWNER');
    expect(parsed.permissions).toContain('sales.create');
  });
});
