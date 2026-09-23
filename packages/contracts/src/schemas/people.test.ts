import { describe, expect, it } from 'vitest';
import {
  createCustomerNoteRequestSchema,
  createCustomerRequestSchema,
  createStaffProfileRequestSchema,
  customerDetailSchema,
  customerQuerySchema,
  customerSummarySchema,
  replaceStaffServicesRequestSchema,
  staffCandidatesDataSchema,
  staffProfileDetailSchema,
  staffProfileSummarySchema,
  staffQuerySchema,
  staffScheduleRequestSchema,
  staffTimeOffRequestSchema,
  updateCustomerRequestSchema,
  updateStaffProfileRequestSchema,
} from './people.js';

const now = '2026-09-23T08:00:00.000Z';

/** A full week is what the schedule replacement contract expects. */
const week = (overrides: Record<number, object> = {}) =>
  Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    startsAt: '09:00',
    endsAt: '18:00',
    isWorking: true,
    ...overrides[dayOfWeek],
  }));

const customerRow = {
  id: 'cus_1',
  organizationId: 'org_1',
  firstName: 'Wei Ling',
  lastName: 'Ng',
  email: 'wei.ling@example.test',
  phone: '+65 9123 4567',
  dateOfBirth: '1992-04-18',
  gender: 'FEMALE' as const,
  addressLine1: '21 Tanjong Pagar Road',
  addressLine2: null,
  city: 'Singapore',
  postalCode: '088444',
  countryCode: 'SG',
  memberNumber: 'M-1001',
  isActive: true,
  createdAt: now,
  updatedAt: now,
};

const staffRow = {
  id: 'stf_1',
  organizationId: 'org_1',
  membershipId: 'mem_1',
  displayName: 'Jia',
  jobTitle: 'Senior stylist',
  bio: null,
  color: '#6144E4',
  isBookable: true,
  hireDate: '2024-02-01',
  endDate: null,
  isActive: true,
  createdAt: now,
  updatedAt: now,
  member: {
    membershipId: 'mem_1',
    role: 'STAFF' as const,
    status: 'ACTIVE' as const,
    userId: 'usr_1',
    email: 'jia@eurosense.test',
    firstName: 'Jia',
    lastName: 'Ting',
    avatarUrl: null,
  },
};

describe('customer contracts', () => {
  it('normalizes a create payload and defaults availability', () => {
    const parsed = createCustomerRequestSchema.parse({
      firstName: '  Wei Ling  ',
      email: '  Wei.Ling@Example.Test ',
      phone: '+65 9123 4567',
      dateOfBirth: '1992-04-18',
      gender: 'FEMALE',
    });

    expect(parsed.firstName).toBe('Wei Ling');
    expect(parsed.email).toBe('wei.ling@example.test');
    expect(parsed.isActive).toBe(true);
    expect(parsed.lastName).toBeUndefined();
  });

  it('requires a first name and rejects a malformed date or email', () => {
    expect(() => createCustomerRequestSchema.parse({})).toThrow();
    expect(() => createCustomerRequestSchema.parse({ firstName: '   ' })).toThrow();
    expect(() =>
      createCustomerRequestSchema.parse({ firstName: 'X', email: 'not-an-email' }),
    ).toThrow();
    expect(() =>
      createCustomerRequestSchema.parse({ firstName: 'X', dateOfBirth: '18-04-1992' }),
    ).toThrow();
  });

  it('accepts an explicit null as a change and rejects an empty update', () => {
    expect(() => updateCustomerRequestSchema.parse({})).toThrow();
    expect(updateCustomerRequestSchema.parse({ email: null }).email).toBeNull();
    expect(updateCustomerRequestSchema.parse({ isActive: false }).isActive).toBe(false);
  });

  it('coerces list query values for search, limit, and active filtering', () => {
    const defaults = customerQuerySchema.parse({});

    expect(defaults.limit).toBe(100);
    expect(defaults.q).toBeUndefined();

    const parsed = customerQuerySchema.parse({ q: 'wei', limit: '25', isActive: 'false' });

    expect(parsed.limit).toBe(25);
    expect(parsed.isActive).toBe(false);
    expect(() => customerQuerySchema.parse({ limit: '500' })).toThrow();
  });

  it('requires a note body', () => {
    expect(createCustomerNoteRequestSchema.parse({ body: '  Prefers no fragrance  ' }).body).toBe(
      'Prefers no fragrance',
    );
    expect(() => createCustomerNoteRequestSchema.parse({ body: '   ' })).toThrow();
  });

  it('parses the summary and detail shapes the endpoints return', () => {
    expect(customerSummarySchema.parse(customerRow)).toMatchObject({
      memberNumber: 'M-1001',
      countryCode: 'SG',
    });

    expect(
      customerDetailSchema.parse({
        ...customerRow,
        notes: [
          {
            id: 'note_1',
            organizationId: 'org_1',
            customerId: 'cus_1',
            body: 'Allergic to ammonia',
            createdAt: now,
            author: { id: 'usr_1', firstName: 'Kai', lastName: 'Tan', email: 'kai@eurosense.test' },
          },
        ],
      }).notes,
    ).toHaveLength(1);
  });
});

describe('staff contracts', () => {
  it('normalizes a profile create and defaults bookability', () => {
    const parsed = createStaffProfileRequestSchema.parse({
      membershipId: 'mem_1',
      jobTitle: '  Senior stylist  ',
      color: '#6144E4',
      hireDate: '2024-02-01',
    });

    expect(parsed.jobTitle).toBe('Senior stylist');
    expect(parsed.isBookable).toBe(true);
    expect(parsed.isActive).toBe(true);
  });

  it('rejects a create without a membership, a bad colour, or a reversed date range', () => {
    expect(() => createStaffProfileRequestSchema.parse({})).toThrow();
    expect(() =>
      createStaffProfileRequestSchema.parse({ membershipId: 'mem_1', color: 'navy' }),
    ).toThrow();
    expect(() =>
      createStaffProfileRequestSchema.parse({
        membershipId: 'mem_1',
        hireDate: '2024-06-01',
        endDate: '2024-01-01',
      }),
    ).toThrow();
  });

  it('rejects an empty profile update', () => {
    expect(() => updateStaffProfileRequestSchema.parse({})).toThrow();
    expect(updateStaffProfileRequestSchema.parse({ isActive: false }).isActive).toBe(false);
  });

  it('filters staff by service and active flag', () => {
    const parsed = staffQuerySchema.parse({ serviceId: 'svc_1', isActive: 'true' });

    expect(parsed).toEqual({ serviceId: 'svc_1', isActive: true });
  });

  it('accepts clearing the service list and rejects malformed ids', () => {
    expect(replaceStaffServicesRequestSchema.parse({ serviceIds: [] }).serviceIds).toEqual([]);
    expect(() => replaceStaffServicesRequestSchema.parse({ serviceIds: [''] })).toThrow();
  });

  it('requires exactly one valid entry per weekday', () => {
    expect(staffScheduleRequestSchema.parse({ schedule: week() }).schedule).toHaveLength(7);

    expect(() => staffScheduleRequestSchema.parse({ schedule: week().slice(0, 6) })).toThrow();
    expect(() =>
      staffScheduleRequestSchema.parse({
        schedule: week({ 3: { startsAt: '18:00', endsAt: '09:00' } }),
      }),
    ).toThrow();
    expect(() =>
      staffScheduleRequestSchema.parse({
        schedule: week({ 5: { startsAt: null, endsAt: null } }),
      }),
    ).toThrow();
  });

  it('allows a non-working day with no times', () => {
    const parsed = staffScheduleRequestSchema.parse({
      schedule: week({ 0: { isWorking: false, startsAt: null, endsAt: null } }),
    });

    expect(parsed.schedule[0]).toMatchObject({ dayOfWeek: 0, isWorking: false });
  });

  it('rejects an absence that ends before it starts', () => {
    expect(() =>
      staffTimeOffRequestSchema.parse({
        startsAt: '2026-09-24T09:00:00.000Z',
        endsAt: '2026-09-24T08:00:00.000Z',
      }),
    ).toThrow();

    expect(
      staffTimeOffRequestSchema.parse({
        startsAt: '2026-09-24T09:00:00.000Z',
        endsAt: '2026-09-25T09:00:00.000Z',
        reason: 'Annual leave',
      }).reason,
    ).toBe('Annual leave');
  });

  it('parses the summary and detail shapes the endpoints return', () => {
    expect(staffProfileSummarySchema.parse(staffRow)).toMatchObject({ jobTitle: 'Senior stylist' });

    expect(
      staffProfileDetailSchema.parse({
        ...staffRow,
        services: [],
        schedule: [
          { id: 'sch_1', dayOfWeek: 1, startsAt: '09:00', endsAt: '18:00', isWorking: true },
        ],
        timeOff: [
          {
            id: 'to_1',
            organizationId: 'org_1',
            staffProfileId: 'stf_1',
            startsAt: '2026-09-24T09:00:00.000Z',
            endsAt: '2026-09-25T09:00:00.000Z',
            reason: null,
            createdById: null,
            createdBy: null,
            createdAt: now,
            updatedAt: now,
          },
        ],
      }),
    ).toMatchObject({ schedule: [{ dayOfWeek: 1 }], timeOff: [{ id: 'to_1' }] });
  });

  it('parses the candidate list a manager picks from', () => {
    const parsed = staffCandidatesDataSchema.parse({
      candidates: [
        {
          membershipId: 'mem_2',
          role: 'RECEPTIONIST',
          status: 'ACTIVE',
          userId: 'usr_2',
          email: 'front@eurosense.test',
          firstName: 'Aisha',
          lastName: 'Rahman',
          avatarUrl: null,
        },
      ],
    });

    expect(parsed.candidates[0]).toMatchObject({ membershipId: 'mem_2', lastName: 'Rahman' });
    expect(() =>
      staffCandidatesDataSchema.parse({ candidates: [{ membershipId: 'mem_2' }] }),
    ).toThrow();
    expect(() =>
      staffCandidatesDataSchema.parse({ candidates: [{ ...staffRow.member, status: 'PENDING' }] }),
    ).toThrow();
  });
});
