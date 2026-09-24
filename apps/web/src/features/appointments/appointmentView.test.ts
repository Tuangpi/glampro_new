import { describe, expect, it } from 'vitest';
import type {
  AppointmentStatus,
  AppointmentSummary,
  CustomerSummary,
  StaffProfileSummary,
} from '@glampro/contracts';
import {
  appointmentStatusLabels,
  columnsOf,
  customerNameOf,
  isClosedStatus,
  nextStatusesOf,
  staffNameOf,
} from './appointmentView';

const staff = (overrides: Partial<StaffProfileSummary> = {}): StaffProfileSummary =>
  ({
    id: 'stf_1',
    organizationId: 'org_1',
    membershipId: 'mem_1',
    displayName: null,
    jobTitle: null,
    bio: null,
    color: null,
    isBookable: true,
    hireDate: null,
    endDate: null,
    isActive: true,
    createdAt: '2026-09-23T00:00:00.000Z',
    updatedAt: '2026-09-23T00:00:00.000Z',
    member: {
      membershipId: 'mem_1',
      role: 'STAFF',
      status: 'ACTIVE',
      userId: 'usr_1',
      email: 'jia@eurosense.test',
      firstName: 'Jia',
      lastName: 'Ting',
      avatarUrl: null,
    },
    ...overrides,
  }) as StaffProfileSummary;

const customer = (overrides: Partial<CustomerSummary> = {}): CustomerSummary =>
  ({
    id: 'cus_1',
    organizationId: 'org_1',
    firstName: 'Wei Ling',
    lastName: 'Ng',
    email: null,
    phone: null,
    dateOfBirth: null,
    gender: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    postalCode: null,
    countryCode: 'SG',
    memberNumber: null,
    isActive: true,
    createdAt: '2026-09-23T00:00:00.000Z',
    updatedAt: '2026-09-23T00:00:00.000Z',
    ...overrides,
  }) as CustomerSummary;

const visit = (overrides: Partial<AppointmentSummary> = {}): AppointmentSummary =>
  ({
    id: 'apt_1',
    organizationId: 'org_1',
    locationId: 'loc_1',
    customerId: 'cus_1',
    staffProfileId: 'stf_1',
    status: 'SCHEDULED',
    startsAt: '2026-09-24T02:00:00.000Z',
    endsAt: '2026-09-24T02:45:00.000Z',
    notes: null,
    cancelledAt: null,
    cancellationReason: null,
    createdById: null,
    durationMinutes: 45,
    priceInCents: 4500,
    createdAt: '2026-09-23T00:00:00.000Z',
    updatedAt: '2026-09-23T00:00:00.000Z',
    services: [],
    customer: customer(),
    staff: staff(),
    location: {
      id: 'loc_1',
      organizationId: 'org_1',
      name: 'Tanjong Pagar',
      code: 'TPG',
      timezone: 'Asia/Singapore',
      currency: 'SGD',
      isActive: true,
    },
    ...overrides,
  }) as AppointmentSummary;

describe('appointment view helpers', () => {
  it('names a stylist by their display name, falling back to the member', () => {
    expect(staffNameOf(staff())).toBe('Jia Ting');
    expect(staffNameOf(staff({ displayName: '  Kai  ' }))).toBe('Kai');
  });

  it('names a customer from the name they have', () => {
    expect(customerNameOf(customer())).toBe('Wei Ling Ng');
    expect(customerNameOf(customer({ lastName: null }))).toBe('Wei Ling');
  });

  it('offers only the moves the transition map allows', () => {
    expect(nextStatusesOf('SCHEDULED')).toContain('COMPLETED');
    expect(nextStatusesOf('COMPLETED')).toEqual([]);
    expect(nextStatusesOf('CANCELLED')).toEqual([]);
    expect(nextStatusesOf('IN_PROGRESS')).toEqual(['COMPLETED', 'CANCELLED']);
  });

  it('marks the statuses that no longer hold the calendar', () => {
    expect(isClosedStatus('COMPLETED')).toBe(true);
    expect(isClosedStatus('CANCELLED')).toBe(true);
    expect(isClosedStatus('NO_SHOW')).toBe(true);
    expect(isClosedStatus('IN_PROGRESS')).toBe(false);
  });

  it('labels every status the contract declares', () => {
    const statuses = Object.keys(appointmentStatusLabels) as AppointmentStatus[];

    expect(statuses).toHaveLength(7);
    expect(appointmentStatusLabels.CHECKED_IN).toBe('Checked in');
  });

  it('groups a day into one column per stylist, in time and name order', () => {
    const kai = staff({ id: 'stf_1', displayName: 'Kai' });
    const aisha = staff({ id: 'stf_2', displayName: 'Aisha' });

    const columns = columnsOf([
      visit({ id: 'apt_late', startsAt: '2026-09-24T05:00:00.000Z', staff: kai }),
      visit({
        id: 'apt_other',
        startsAt: '2026-09-24T01:00:00.000Z',
        staffProfileId: 'stf_2',
        staff: aisha,
      }),
      visit({ id: 'apt_early', startsAt: '2026-09-24T03:00:00.000Z', staff: kai }),
    ]);

    expect(columns.map((column) => column.name)).toEqual(['Aisha', 'Kai']);
    expect(columns[1]?.visits.map((entry) => entry.id)).toEqual(['apt_early', 'apt_late']);
    expect(columnsOf([])).toEqual([]);
  });
});
