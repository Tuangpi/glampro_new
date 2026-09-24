import { describe, expect, it } from 'vitest';
import {
  appointmentDetailSchema,
  appointmentQuerySchema,
  appointmentStatusTransitions,
  appointmentSummarySchema,
  availabilityQuerySchema,
  changeAppointmentStatusRequestSchema,
  createAppointmentRequestSchema,
  occupyingAppointmentStatuses,
  updateAppointmentRequestSchema,
} from './appointments.js';

const now = '2026-09-24T02:00:00.000Z';

const customer = {
  id: 'cus_1',
  organizationId: 'org_1',
  firstName: 'Wei Ling',
  lastName: 'Ng',
  email: 'wei.ling@example.test',
  phone: '+65 9123 4567',
  dateOfBirth: null,
  gender: 'FEMALE' as const,
  addressLine1: null,
  addressLine2: null,
  city: null,
  postalCode: null,
  countryCode: 'SG',
  memberNumber: 'M-1001',
  isActive: true,
  createdAt: now,
  updatedAt: now,
};

const staff = {
  id: 'stf_1',
  organizationId: 'org_1',
  membershipId: 'mem_1',
  displayName: 'Jia',
  jobTitle: 'Senior stylist',
  bio: null,
  color: '#6144E4',
  isBookable: true,
  hireDate: null,
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

const location = {
  id: 'loc_1',
  organizationId: 'org_1',
  name: 'Tanjong Pagar',
  code: 'TPG',
  timezone: 'Asia/Singapore',
  currency: 'SGD',
  isActive: true,
};

const appointmentRow = {
  id: 'apt_1',
  organizationId: 'org_1',
  locationId: 'loc_1',
  customerId: 'cus_1',
  staffProfileId: 'stf_1',
  status: 'SCHEDULED' as const,
  startsAt: '2026-09-24T01:00:00.000Z',
  endsAt: '2026-09-24T02:15:00.000Z',
  notes: null,
  cancelledAt: null,
  cancellationReason: null,
  createdById: 'usr_1',
  durationMinutes: 75,
  priceInCents: 9000,
  createdAt: now,
  updatedAt: now,
  services: [
    {
      id: 'aps_1',
      serviceId: 'svc_1',
      name: 'Women’s cut',
      durationMinutes: 45,
      priceInCents: 4500,
      sortOrder: 0,
    },
    {
      id: 'aps_2',
      serviceId: 'svc_2',
      name: 'Blow dry',
      durationMinutes: 30,
      priceInCents: 4500,
      sortOrder: 1,
    },
  ],
  customer,
  staff,
  location,
};

describe('appointment request contracts', () => {
  it('requires a location, a customer, a staff member, and at least one service', () => {
    const parsed = createAppointmentRequestSchema.parse({
      locationId: 'loc_1',
      customerId: 'cus_1',
      staffProfileId: 'stf_1',
      serviceIds: ['svc_1'],
      startsAt: '2026-09-24T01:00:00.000Z',
    });

    expect(parsed.serviceIds).toEqual(['svc_1']);
    expect(parsed.notes).toBeUndefined();

    expect(() =>
      createAppointmentRequestSchema.parse({
        locationId: 'loc_1',
        customerId: 'cus_1',
        staffProfileId: 'stf_1',
        serviceIds: [],
        startsAt: '2026-09-24T01:00:00.000Z',
      }),
    ).toThrow();

    expect(() =>
      createAppointmentRequestSchema.parse({
        locationId: 'loc_1',
        customerId: 'cus_1',
        staffProfileId: 'stf_1',
        serviceIds: ['svc_1'],
        startsAt: '2026-09-24 01:00',
      }),
    ).toThrow();
  });

  it('accepts a reschedule, a staff swap, and clearing the notes, but not an empty update', () => {
    expect(() => updateAppointmentRequestSchema.parse({})).toThrow();

    const parsed = updateAppointmentRequestSchema.parse({
      startsAt: '2026-09-24T03:00:00.000Z',
      staffProfileId: 'stf_2',
      notes: null,
    });

    expect(parsed).toMatchObject({ staffProfileId: 'stf_2', notes: null });
  });

  it('keeps the status change to the declared statuses', () => {
    expect(changeAppointmentStatusRequestSchema.parse({ status: 'CHECKED_IN' }).status).toBe(
      'CHECKED_IN',
    );
    expect(
      changeAppointmentStatusRequestSchema.parse({ status: 'CANCELLED', reason: ' Ill ' }).reason,
    ).toBe('Ill');
    expect(() =>
      changeAppointmentStatusRequestSchema.parse({ status: 'ARCHIVED', reason: null }),
    ).toThrow();
  });
});

describe('calendar query contracts', () => {
  it('defaults the page size and coerces query strings', () => {
    const parsed = appointmentQuerySchema.parse({ limit: '25', status: 'CONFIRMED' });

    expect(parsed).toMatchObject({ limit: 25, status: 'CONFIRMED' });
    expect(appointmentQuerySchema.parse({}).limit).toBe(100);
  });

  it('insists on a location for a date, because the day depends on its time zone', () => {
    expect(() => appointmentQuerySchema.parse({ date: '2026-09-24' })).toThrow();
    expect(appointmentQuerySchema.parse({ date: '2026-09-24', locationId: 'loc_1' }).date).toBe(
      '2026-09-24',
    );
  });

  it('takes either a date or a range, and a range that runs forwards', () => {
    const range = appointmentQuerySchema.parse({
      from: '2026-09-24T00:00:00.000Z',
      to: '2026-09-25T00:00:00.000Z',
    });

    expect(range.from).toBe('2026-09-24T00:00:00.000Z');
    expect(() => appointmentQuerySchema.parse({ from: '2026-09-24T00:00:00.000Z' })).toThrow();
    expect(() =>
      appointmentQuerySchema.parse({
        from: '2026-09-25T00:00:00.000Z',
        to: '2026-09-24T00:00:00.000Z',
      }),
    ).toThrow();
    expect(() =>
      appointmentQuerySchema.parse({
        date: '2026-09-24',
        locationId: 'loc_1',
        from: '2026-09-24T00:00:00.000Z',
        to: '2026-09-25T00:00:00.000Z',
      }),
    ).toThrow();
  });

  it('asks availability with either services or an explicit duration', () => {
    const parsed = availabilityQuerySchema.parse({
      locationId: 'loc_1',
      staffProfileId: 'stf_1',
      date: '2026-09-24',
      serviceIds: 'svc_1,svc_2',
    });

    expect(parsed.slotMinutes).toBe(15);
    expect(parsed.serviceIds).toEqual(['svc_1', 'svc_2']);

    // A repeated query value parses the same way as a comma-separated one.
    expect(
      availabilityQuerySchema.parse({
        locationId: 'loc_1',
        staffProfileId: 'stf_1',
        date: '2026-09-24',
        serviceIds: ['svc_1', 'svc_2'],
      }).serviceIds,
    ).toEqual(['svc_1', 'svc_2']);

    expect(
      availabilityQuerySchema.parse({
        locationId: 'loc_1',
        staffProfileId: 'stf_1',
        date: '2026-09-24',
        durationMinutes: '45',
        slotMinutes: '30',
      }),
    ).toMatchObject({ durationMinutes: 45, slotMinutes: 30 });

    expect(() =>
      availabilityQuerySchema.parse({
        locationId: 'loc_1',
        staffProfileId: 'stf_1',
        date: '2026-09-24',
      }),
    ).toThrow();
  });
});

describe('appointment read contracts', () => {
  it('parses the summary the calendar renders', () => {
    const parsed = appointmentSummarySchema.parse(appointmentRow);

    expect(parsed).toMatchObject({
      id: 'apt_1',
      status: 'SCHEDULED',
      durationMinutes: 75,
      customer: { firstName: 'Wei Ling' },
      staff: { displayName: 'Jia' },
      location: { timezone: 'Asia/Singapore' },
    });
    expect(parsed.services.map((service) => service.sortOrder)).toEqual([0, 1]);
  });

  it('parses the detail shape with its status trail', () => {
    const parsed = appointmentDetailSchema.parse({
      ...appointmentRow,
      statusHistory: [
        {
          id: 'ash_1',
          organizationId: 'org_1',
          appointmentId: 'apt_1',
          fromStatus: null,
          toStatus: 'SCHEDULED',
          reason: null,
          changedById: 'usr_1',
          changedBy: { id: 'usr_1', firstName: 'Kai', lastName: 'Tan', email: 'kai@salon.test' },
          createdAt: now,
        },
      ],
    });

    expect(parsed.statusHistory[0]).toMatchObject({ fromStatus: null, toStatus: 'SCHEDULED' });
  });

  it('names the statuses that hold a slot and the ones that are terminal', () => {
    expect(occupyingAppointmentStatuses).toEqual([
      'SCHEDULED',
      'CONFIRMED',
      'CHECKED_IN',
      'IN_PROGRESS',
    ]);
    // A walk-in can be booked and finished without the intermediate steps.
    expect(appointmentStatusTransitions.SCHEDULED).toContain('COMPLETED');
    expect(appointmentStatusTransitions.CONFIRMED).toContain('NO_SHOW');
    expect(appointmentStatusTransitions.COMPLETED).toEqual([]);
    expect(appointmentStatusTransitions.CANCELLED).toEqual([]);
    expect(appointmentStatusTransitions.NO_SHOW).toEqual([]);
    expect(appointmentStatusTransitions.IN_PROGRESS).toEqual(['COMPLETED', 'CANCELLED']);
    // Nothing walks backwards.
    expect(appointmentStatusTransitions.IN_PROGRESS).not.toContain('SCHEDULED');
    expect(appointmentStatusTransitions.CHECKED_IN).not.toContain('CONFIRMED');
  });
});
