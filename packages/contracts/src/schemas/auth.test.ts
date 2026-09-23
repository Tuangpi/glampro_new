import { describe, expect, it } from 'vitest';
import { registrationRequestSchema } from './auth.js';

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
