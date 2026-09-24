import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/database/prisma.js';
import type { MembershipRole } from '../src/generated/prisma/client.js';
import { hashRefreshToken, issueAccessToken } from '../src/modules/auth/tokens.js';
import { zonedTimeToUtc } from '../src/shared/zoned-time.js';
import { truncateAllTables } from './helpers/test-db.js';

const app = createApp();
const zone = 'Asia/Singapore';
const reportDay = '2026-09-24';
const at = (date: string, time: string) => zonedTimeToUtc(date, time, zone);

let salonCount = 0;

type Salon = {
  accessToken: string;
  organizationId: string;
  locationId: string;
  locationName: string;
  serviceId: string;
  productId: string;
  staffProfileId: string;
  customerId: string;
};

const registerSalon = async (timezone = zone): Promise<Salon> => {
  salonCount += 1;
  const response = await request(app)
    .post('/api/v1/auth/register')
    .send({
      firstName: 'Report',
      lastName: 'Owner',
      email: `report-owner-${salonCount}@example.test`,
      password: 'SecurePassword123',
      organizationName: `Report Salon ${salonCount}`,
      locationName: `Report Branch ${salonCount}`,
      timezone,
    });
  expect(response.status).toBe(201);
  const membership = response.body.data.organizations[0];
  const organizationId = membership.organizationId as string;
  const location = await prisma.location.findFirstOrThrow({ where: { organizationId } });
  const serviceCategory = await prisma.serviceCategory.create({
    data: { organizationId, name: 'Services' },
    select: { id: true },
  });
  const service = await prisma.service.create({
    data: {
      organizationId,
      serviceCategoryId: serviceCategory.id,
      name: 'Signature cut',
      durationMinutes: 45,
      priceInCents: 4500,
    },
    select: { id: true },
  });
  const productCategory = await prisma.productCategory.create({
    data: { organizationId, name: 'Products' },
    select: { id: true },
  });
  const product = await prisma.product.create({
    data: {
      organizationId,
      productCategoryId: productCategory.id,
      name: 'Shampoo',
      priceInCents: 1800,
      costInCents: 800,
      trackInventory: true,
    },
    select: { id: true },
  });
  await prisma.inventoryLevel.create({
    data: { organizationId, productId: product.id, locationId: location.id, quantityOnHand: 20 },
  });
  const customer = await prisma.customer.create({
    data: { organizationId, firstName: 'Live', lastName: 'Customer' },
    select: { id: true },
  });
  const staffProfile = await prisma.staffProfile.create({
    data: { organizationId, membershipId: membership.id, displayName: 'Kai' },
    select: { id: true },
  });
  return {
    accessToken: response.body.data.accessToken as string,
    organizationId,
    locationId: location.id,
    locationName: location.name,
    serviceId: service.id,
    productId: product.id,
    staffProfileId: staffProfile.id,
    customerId: customer.id,
  };
};

const bearer = (token: string) => `Bearer ${token}`;

const seedMember = async (organizationId: string, role: MembershipRole) => {
  salonCount += 1;
  const user = await prisma.user.create({
    data: {
      email: `report-member-${salonCount}@example.test`,
      firstName: 'Report',
      lastName: 'Member',
      credential: { create: { passwordHash: 'unused' } },
    },
    select: { id: true, platformRole: true },
  });
  await prisma.organizationMembership.create({
    data: { organizationId, userId: user.id, role, status: 'ACTIVE' },
  });
  const session = await prisma.authSession.create({
    data: {
      userId: user.id,
      tokenFamilyId: `report-family-${user.id}`,
      refreshTokenHash: hashRefreshToken(`report-refresh-${user.id}`),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
    select: { id: true },
  });
  const { token } = await issueAccessToken({
    userId: user.id,
    sessionId: session.id,
    platformRole: user.platformRole,
  });
  return token;
};

const createSale = async (salon: Salon, input: Record<string, unknown> = {}) => {
  const response = await request(app)
    .post('/api/v1/sales')
    .set('authorization', bearer(salon.accessToken))
    .send({
      locationId: salon.locationId,
      customerId: salon.customerId,
      lines: [
        { type: 'SERVICE', serviceId: salon.serviceId, staffProfileId: salon.staffProfileId },
        { type: 'PRODUCT', productId: salon.productId, quantity: 2 },
      ],
      payments: [{ method: 'CASH', amountInCents: 8100 }],
      ...input,
    });
  expect(response.status).toBe(201);
  return response.body.data.sale as { id: string; receiptCode: string };
};

const book = async (
  salon: Salon,
  input: { date?: string; time?: string; status?: string } = {},
) => {
  const startsAt = at(input.date ?? reportDay, input.time ?? '09:00');
  return prisma.appointment.create({
    data: {
      organizationId: salon.organizationId,
      locationId: salon.locationId,
      customerId: salon.customerId,
      staffProfileId: salon.staffProfileId,
      status: (input.status ?? 'SCHEDULED') as 'SCHEDULED',
      startsAt,
      endsAt: new Date(startsAt.getTime() + 45 * 60_000),
      services: {
        create: {
          organizationId: salon.organizationId,
          serviceId: salon.serviceId,
          name: 'Signature cut',
          durationMinutes: 45,
          priceInCents: 4500,
        },
      },
    },
  });
};

const dashboard = (salon: Salon, date = reportDay) =>
  request(app)
    .get('/api/v1/dashboard')
    .set('authorization', bearer(salon.accessToken))
    .query({ locationId: salon.locationId, date });

const report = (path: string, salon: Salon, query: Record<string, string> = {}) =>
  request(app)
    .get(`/api/v1/reports/${path}`)
    .set('authorization', bearer(salon.accessToken))
    .query({ locationId: salon.locationId, from: reportDay, to: reportDay, ...query });

describe('report authorization and scope', () => {
  beforeEach(truncateAllTables);

  it('requires authentication, reports.view, and an owned location', async () => {
    const salon = await registerSalon();
    const receptionist = await seedMember(salon.organizationId, 'RECEPTIONIST');
    const rival = await registerSalon();

    const paths = ['revenue', 'appointments', 'payments', 'staff'] as const;

    for (const path of paths) {
      const unauthenticated = await request(app)
        .get(`/api/v1/reports/${path}`)
        .query({ locationId: salon.locationId, from: reportDay, to: reportDay });
      const forbidden = await request(app)
        .get(`/api/v1/reports/${path}`)
        .set('authorization', bearer(receptionist))
        .query({ locationId: salon.locationId, from: reportDay, to: reportDay });
      const foreign = await request(app)
        .get(`/api/v1/reports/${path}`)
        .set('authorization', bearer(salon.accessToken))
        .query({ locationId: rival.locationId, from: reportDay, to: reportDay });
      expect([unauthenticated.status, forbidden.status, foreign.status]).toEqual([401, 403, 404]);
    }

    const unauthenticatedDashboard = await request(app)
      .get('/api/v1/dashboard')
      .query({ locationId: salon.locationId, date: reportDay });
    const forbiddenDashboard = await request(app)
      .get('/api/v1/dashboard')
      .set('authorization', bearer(receptionist))
      .query({ locationId: salon.locationId, date: reportDay });
    const foreignDashboard = await request(app)
      .get('/api/v1/dashboard')
      .set('authorization', bearer(salon.accessToken))
      .query({ locationId: rival.locationId, date: reportDay });
    expect(unauthenticatedDashboard.status).toBe(401);
    expect(forbiddenDashboard.status).toBe(403);
    expect(foreignDashboard.status).toBe(404);
  });

  it('rejects inverted and unbounded ranges', async () => {
    const salon = await registerSalon();
    const inverted = await report('revenue', salon, { from: '2026-09-25', to: reportDay });
    const unbounded = await report('revenue', salon, { from: '2024-01-01', to: reportDay });
    expect(inverted.status).toBe(422);
    expect(unbounded.status).toBe(422);
  });
});

describe('live dashboard and financial reports', () => {
  beforeEach(truncateAllTables);

  it('calculates dashboard KPIs, lists, and top items from live rows', async () => {
    const salon = await registerSalon();
    const sale = await createSale(salon);
    await book(salon, { time: '10:00', status: 'CONFIRMED' });

    const response = await dashboard(salon);
    expect(response.status).toBe(200);
    expect(response.body.data.dashboard).toMatchObject({
      period: {
        from: reportDay,
        to: reportDay,
        startsAt: '2026-09-23T16:00:00.000Z',
        endsAt: '2026-09-24T16:00:00.000Z',
        location: { name: salon.locationName, timezone: zone, currency: 'SGD' },
      },
      kpis: {
        netSalesInCents: 8100,
        appointmentCount: 1,
        uniquePayingCustomers: 1,
        averageTicketInCents: 8100,
      },
      appointments: [{ customerName: 'Live Customer', status: 'CONFIRMED' }],
      recentSales: [{ id: sale.id, totalInCents: 8100 }],
      topItems: [
        { name: 'Signature cut', quantity: 1, grossInCents: 4500 },
        { name: 'Shampoo', quantity: 2, grossInCents: 3600 },
      ],
    });
  });

  it('excludes voids and subtracts refunds from revenue', async () => {
    const salon = await registerSalon();
    const completed = await createSale(salon);
    const voided = await createSale(salon, { customerId: null });
    await request(app)
      .post(`/api/v1/sales/${voided.id}/void`)
      .set('authorization', bearer(salon.accessToken))
      .send({ reason: 'Duplicate' });
    await request(app)
      .post(`/api/v1/sales/${completed.id}/refunds`)
      .set('authorization', bearer(salon.accessToken))
      .send({ amountInCents: 1000, method: 'CARD', reason: 'Goodwill' });

    const response = await report('revenue', salon);
    expect(response.status).toBe(200);
    expect(response.body.data.revenue.summary).toMatchObject({
      saleCount: 1,
      grossSalesInCents: 8100,
      refundedInCents: 1000,
      netSalesInCents: 7100,
      averageTicketInCents: 7100,
      refundRatePercentage: 12.3,
    });
  });

  it('returns complete zero-valued reports for an empty organization', async () => {
    const salon = await registerSalon();

    const [
      dashboardResponse,
      revenueResponse,
      appointmentsResponse,
      paymentsResponse,
      staffResponse,
    ] = await Promise.all([
      dashboard(salon),
      report('revenue', salon),
      report('appointments', salon),
      report('payments', salon),
      report('staff', salon),
    ]);

    expect([
      dashboardResponse.status,
      revenueResponse.status,
      appointmentsResponse.status,
      paymentsResponse.status,
      staffResponse.status,
    ]).toEqual([200, 200, 200, 200, 200]);
    expect(dashboardResponse.body.data.dashboard.kpis).toEqual({
      netSalesInCents: 0,
      appointmentCount: 0,
      uniquePayingCustomers: 0,
      averageTicketInCents: 0,
    });
    expect(revenueResponse.body.data.revenue.summary).toMatchObject({
      saleCount: 0,
      grossSalesInCents: 0,
      netSalesInCents: 0,
      averageTicketInCents: 0,
      refundRatePercentage: 0,
    });
    expect(appointmentsResponse.body.data.appointments.summary).toMatchObject({
      total: 0,
      completionRatePercentage: 0,
      cancellationRatePercentage: 0,
      noShowRatePercentage: 0,
    });
    expect(paymentsResponse.body.data.payments).toMatchObject({
      tenderInCents: 0,
      refundInCents: 0,
      netInCents: 0,
    });
    expect(staffResponse.body.data.staff.staff[0]).toMatchObject({
      appointmentCount: 0,
      attributedSalesInCents: 0,
    });
  });

  it('reports split tenders and refunds by their actual payment methods', async () => {
    const salon = await registerSalon();
    const sale = await createSale(salon, {
      payments: [
        { method: 'CASH', amountInCents: 1000 },
        { method: 'CARD', amountInCents: 7100 },
      ],
    });
    await request(app)
      .post(`/api/v1/sales/${sale.id}/refunds`)
      .set('authorization', bearer(salon.accessToken))
      .send({ amountInCents: 1000, method: 'PAYNOW', reason: 'Refund' });

    const response = await report('payments', salon);
    expect(response.status).toBe(200);
    expect(response.body.data.payments).toMatchObject({
      tenderInCents: 8100,
      refundInCents: 1000,
      netInCents: 7100,
    });
    expect(response.body.data.payments.methods).toEqual(
      expect.arrayContaining([
        { method: 'CASH', tenderInCents: 1000, refundInCents: 0, netInCents: 1000 },
        { method: 'CARD', tenderInCents: 7100, refundInCents: 0, netInCents: 7100 },
        { method: 'PAYNOW', tenderInCents: 0, refundInCents: 1000, netInCents: -1000 },
      ]),
    );
  });
});

describe('appointment and staff reporting', () => {
  beforeEach(truncateAllTables);

  it('summarizes appointment outcomes, service demand, and peak hours', async () => {
    const salon = await registerSalon();
    await book(salon, { time: '09:00', status: 'COMPLETED' });
    await book(salon, { time: '11:00', status: 'CANCELLED' });
    await book(salon, { time: '11:30', status: 'NO_SHOW' });

    const response = await report('appointments', salon);
    expect(response.status).toBe(200);
    expect(response.body.data.appointments.summary).toMatchObject({
      total: 3,
      completed: 1,
      cancelled: 1,
      noShow: 1,
      completionRatePercentage: 33.3,
      cancellationRatePercentage: 33.3,
      noShowRatePercentage: 33.3,
      bookedServiceMinutes: 135,
      completedServiceMinutes: 45,
    });
    expect(response.body.data.appointments.serviceDemand[0]).toMatchObject({
      name: 'Signature cut',
      bookingCount: 3,
      bookedValueInCents: 13500,
      bookedServiceMinutes: 135,
    });
    expect(response.body.data.appointments.peakHours[0]).toEqual({
      hour: '11',
      appointmentCount: 2,
    });
  });

  it('attributes appointments and gross service sales to the selected staff member', async () => {
    const salon = await registerSalon();
    await book(salon, { time: '09:00', status: 'COMPLETED' });
    await createSale(salon);

    const response = await report('staff', salon);
    expect(response.status).toBe(200);
    expect(response.body.data.staff.staff[0]).toMatchObject({
      staffProfileId: salon.staffProfileId,
      name: 'Kai',
      appointmentCount: 1,
      completedAppointmentCount: 1,
      completedServiceMinutes: 45,
      uniqueCustomerCount: 1,
      attributedSaleCount: 1,
      attributedSalesInCents: 4500,
    });
  });

  it('keeps reports inside the location wall-clock day across a UTC boundary', async () => {
    const salon = await registerSalon('America/New_York');
    const before = await prisma.sale.create({
      data: {
        organizationId: salon.organizationId,
        locationId: salon.locationId,
        receiptNumber: 900,
        receiptCode: 'BEFORE-900',
        status: 'COMPLETED',
        subtotalInCents: 1000,
        totalInCents: 1000,
        paidInCents: 1000,
        createdAt: new Date('2026-09-24T03:59:59.000Z'),
      },
    });
    const inside = await prisma.sale.create({
      data: {
        organizationId: salon.organizationId,
        locationId: salon.locationId,
        receiptNumber: 901,
        receiptCode: 'INSIDE-901',
        status: 'COMPLETED',
        subtotalInCents: 2000,
        totalInCents: 2000,
        paidInCents: 2000,
        createdAt: new Date('2026-09-24T04:00:00.000Z'),
      },
    });
    const after = await prisma.sale.create({
      data: {
        organizationId: salon.organizationId,
        locationId: salon.locationId,
        receiptNumber: 902,
        receiptCode: 'AFTER-902',
        status: 'COMPLETED',
        subtotalInCents: 4000,
        totalInCents: 4000,
        paidInCents: 4000,
        createdAt: new Date('2026-09-25T04:00:00.000Z'),
      },
    });

    const response = await report('revenue', salon);
    expect(response.status).toBe(200);
    expect(response.body.data.revenue.period).toMatchObject({
      startsAt: '2026-09-24T04:00:00.000Z',
      endsAt: '2026-09-25T04:00:00.000Z',
    });
    expect(response.body.data.revenue.summary.saleCount).toBe(1);
    expect(response.body.data.revenue.summary.grossSalesInCents).toBe(2000);
    expect([before.id, inside.id, after.id]).toContain(inside.id);
  });
});
