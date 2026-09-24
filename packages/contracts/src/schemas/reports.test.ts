import { describe, expect, it } from 'vitest';
import {
  dashboardDataSchema,
  dashboardQuerySchema,
  paymentReportDataSchema,
  reportQuerySchema,
} from './reports.js';

const location = {
  id: 'loc_1',
  organizationId: 'org_1',
  name: 'Tanjong Pagar',
  code: 'TPG',
  timezone: 'Asia/Singapore',
  currency: 'SGD',
  isActive: true,
};

const period = {
  location,
  from: '2026-09-24',
  to: '2026-09-24',
  startsAt: '2026-09-23T16:00:00.000Z',
  endsAt: '2026-09-24T16:00:00.000Z',
};

describe('reporting contracts', () => {
  it('validates the dashboard location and local day', () => {
    expect(dashboardQuerySchema.parse({ locationId: 'loc_1', date: '2026-09-24' })).toEqual({
      locationId: 'loc_1',
      date: '2026-09-24',
    });
    expect(() => dashboardQuerySchema.parse({ locationId: 'loc_1', date: 'yesterday' })).toThrow();
  });

  it('accepts an inclusive range of at most 366 days', () => {
    expect(
      reportQuerySchema.parse({ locationId: 'loc_1', from: '2026-01-01', to: '2026-12-31' }),
    ).toMatchObject({ from: '2026-01-01', to: '2026-12-31' });
    expect(() =>
      reportQuerySchema.parse({ locationId: 'loc_1', from: '2025-01-01', to: '2026-01-02' }),
    ).toThrow();
    expect(() =>
      reportQuerySchema.parse({ locationId: 'loc_1', from: '2026-09-25', to: '2026-09-24' }),
    ).toThrow();
  });

  it('parses dashboard figures and operational lists', () => {
    const parsed = dashboardDataSchema.parse({
      period,
      kpis: {
        netSalesInCents: 14600,
        appointmentCount: 18,
        uniquePayingCustomers: 16,
        averageTicketInCents: 912,
      },
      appointments: [
        {
          id: 'apt_1',
          startsAt: '2026-09-24T01:00:00.000Z',
          endsAt: '2026-09-24T01:45:00.000Z',
          customerName: 'Wei Ling',
          serviceNames: ['Signature haircut'],
          durationMinutes: 45,
          staffName: 'Jia Ting',
          status: 'CONFIRMED',
        },
      ],
      recentSales: [],
      topItems: [],
    });

    expect(parsed.kpis.netSalesInCents).toBe(14600);
    expect(parsed.appointments[0]?.status).toBe('CONFIRMED');
  });

  it('allows a payment-method net to be negative when refunds exceed tenders', () => {
    const report = paymentReportDataSchema.parse({
      period,
      tenderInCents: 0,
      refundInCents: 100,
      netInCents: -100,
      methods: [{ method: 'PAYNOW', tenderInCents: 0, refundInCents: 100, netInCents: -100 }],
    });

    expect(report.netInCents).toBe(-100);
  });
});
