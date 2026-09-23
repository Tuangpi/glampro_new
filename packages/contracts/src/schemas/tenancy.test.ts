import { describe, expect, it } from 'vitest';
import {
  businessHourSchema,
  businessHoursRequestSchema,
  changeMemberStatusRequestSchema,
  inviteMemberRequestSchema,
  locationDetailSchema,
  memberSummarySchema,
  timeOfDaySchema,
  updateLocationRequestSchema,
  updateOrganizationRequestSchema,
} from './tenancy.js';

const validHour = (dayOfWeek: number) => ({
  dayOfWeek,
  opensAt: '09:00',
  closesAt: '20:00',
  isClosed: false,
});

describe('tenancy contracts', () => {
  it('parses 24-hour times and rejects malformed ones', () => {
    expect(timeOfDaySchema.parse('23:59')).toBe('23:59');
    expect(() => timeOfDaySchema.parse('9:00')).toThrow();
    expect(() => timeOfDaySchema.parse('24:00')).toThrow();
    expect(() => timeOfDaySchema.parse('noon')).toThrow();
  });

  it('accepts a closed day without opening times', () => {
    const closed = { dayOfWeek: 0, opensAt: null, closesAt: null, isClosed: true };
    expect(businessHourSchema.parse(closed).isClosed).toBe(true);
  });

  it('requires a complete, unique week with usable open days', () => {
    const complete = { hours: Array.from({ length: 7 }, (_, day) => validHour(day)) };
    expect(businessHoursRequestSchema.parse(complete).hours).toHaveLength(7);

    expect(() => businessHoursRequestSchema.parse({ hours: complete.hours.slice(0, 6) })).toThrow();

    const duplicated = { hours: [...complete.hours.slice(0, 6), validHour(0)] };
    expect(() => businessHoursRequestSchema.parse(duplicated)).toThrow();

    const backwards = {
      hours: complete.hours.map((hour) => ({ ...hour, opensAt: '20:00', closesAt: '09:00' })),
    };
    expect(() => businessHoursRequestSchema.parse(backwards)).toThrow();
  });

  it('requires at least one field when updating an organization or a location', () => {
    expect(updateOrganizationRequestSchema.parse({ name: 'Eurosense Hair Studio' }).name).toBe(
      'Eurosense Hair Studio',
    );
    expect(() => updateOrganizationRequestSchema.parse({})).toThrow();
    expect(() => updateLocationRequestSchema.parse({})).toThrow();

    expect(updateLocationRequestSchema.parse({ pricesIncludeTax: false }).pricesIncludeTax).toBe(
      false,
    );
  });

  it('clears optional location fields with null', () => {
    const parsed = updateLocationRequestSchema.parse({ phone: null, city: null });
    expect(parsed.phone).toBeNull();
    expect(parsed.city).toBeNull();
  });

  it('rejects a receipt prefix with punctuation and an over-long location code', () => {
    expect(() => updateLocationRequestSchema.parse({ receiptPrefix: 'SALE-1' })).toThrow();
    expect(() => updateLocationRequestSchema.parse({ code: 'x' })).toThrow();
    expect(updateLocationRequestSchema.parse({ code: 'TPG-2' }).code).toBe('TPG-2');
  });

  it('parses an invitation with any declared role', () => {
    expect(inviteMemberRequestSchema.parse({ email: 'Staff@Salon.test', role: 'STAFF' })).toEqual({
      email: 'staff@salon.test',
      role: 'STAFF',
    });
    expect(() =>
      inviteMemberRequestSchema.parse({ email: 'staff@salon.test', role: 'BOSS' }),
    ).toThrow();
  });

  it('only accepts real membership status transitions', () => {
    expect(changeMemberStatusRequestSchema.parse({ status: 'SUSPENDED' }).status).toBe('SUSPENDED');
    expect(() => changeMemberStatusRequestSchema.parse({ status: 'INVITED' })).toThrow();
  });

  it('parses a full location detail', () => {
    const parsed = locationDetailSchema.parse({
      id: 'location_1',
      organizationId: 'org_1',
      name: 'Tanjong Pagar',
      code: 'TPG',
      timezone: 'Asia/Singapore',
      currency: 'SGD',
      isActive: true,
      phone: null,
      email: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      postalCode: null,
      countryCode: 'SG',
      pricesIncludeTax: true,
      receiptPrefix: 'SALE',
      nextReceiptNumber: 1,
      createdAt: '2026-09-23T08:00:00.000Z',
      updatedAt: '2026-09-23T08:00:00.000Z',
    });

    expect(parsed.nextReceiptNumber).toBe(1);
  });

  it('parses a member summary with its user', () => {
    const parsed = memberSummarySchema.parse({
      id: 'membership_1',
      userId: 'user_1',
      role: 'ORG_OWNER',
      status: 'ACTIVE',
      joinedAt: '2026-09-23T08:00:00.000Z',
      createdAt: '2026-09-23T08:00:00.000Z',
      isSelf: true,
      user: {
        id: 'user_1',
        email: 'owner@salon.test',
        firstName: 'Kai',
        lastName: 'Tan',
        avatarUrl: null,
      },
    });

    expect(parsed.isSelf).toBe(true);
    expect(parsed.user.email).toBe('owner@salon.test');
  });
});
