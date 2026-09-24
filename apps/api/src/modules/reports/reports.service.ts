import type {
  AppointmentReportData,
  DashboardData,
  PaymentMethod,
  PaymentReportData,
  ReportItem,
  ReportPeriod,
  RevenueReportData,
  StaffReportData,
} from '@glampro/contracts';
import { appointmentStatuses, paymentMethods } from '@glampro/contracts';
import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../shared/http/app-error.js';
import { addDays, zonedDayRange, zonedPartsAt } from '../../shared/zoned-time.js';

const locationSelection = {
  id: true,
  organizationId: true,
  name: true,
  code: true,
  timezone: true,
  currency: true,
  isActive: true,
} as const;

const reportSaleSelection = {
  id: true,
  receiptCode: true,
  customerId: true,
  status: true,
  subtotalInCents: true,
  discountInCents: true,
  taxInCents: true,
  totalInCents: true,
  refundedInCents: true,
  createdAt: true,
  customer: { select: { firstName: true, lastName: true } },
  lines: {
    select: {
      type: true,
      serviceId: true,
      productId: true,
      staffProfileId: true,
      name: true,
      quantity: true,
      totalInCents: true,
    },
  },
} as const;

const reportAppointmentSelection = {
  id: true,
  status: true,
  customerId: true,
  staffProfileId: true,
  startsAt: true,
  endsAt: true,
  customer: { select: { firstName: true, lastName: true } },
  staffProfile: {
    select: {
      displayName: true,
      membership: { select: { user: { select: { firstName: true, lastName: true } } } },
    },
  },
  services: {
    select: { serviceId: true, name: true, durationMinutes: true, priceInCents: true },
    orderBy: { sortOrder: 'asc' },
  },
} as const;

const reportStaffSelection = {
  id: true,
  displayName: true,
  isActive: true,
  membership: { select: { user: { select: { firstName: true, lastName: true } } } },
} as const;

type ReportSaleRow = Prisma.SaleGetPayload<{ select: typeof reportSaleSelection }>;
type ReportAppointmentRow = Prisma.AppointmentGetPayload<{
  select: typeof reportAppointmentSelection;
}>;

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
const average = (total: number, count: number) => (count === 0 ? 0 : Math.round(total / count));
const percentage = (part: number, whole: number) =>
  whole === 0 ? 0 : Math.round((part / whole) * 1_000) / 10;

const displayName = (parts: { firstName: string; lastName: string | null }) =>
  [parts.firstName, parts.lastName].filter(Boolean).join(' ');

const datesBetween = (from: string, to: string) => {
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  return dates;
};

const scopedReportLocation = async (organizationId: string, locationId: string) => {
  const location = await prisma.location.findFirst({
    where: { id: locationId, organizationId, isActive: true },
    select: locationSelection,
  });

  if (!location) throw new AppError(404, 'NOT_FOUND', 'Location was not found');
  return location;
};

const reportPeriod = async (
  organizationId: string,
  locationId: string,
  from: string,
  to: string,
): Promise<ReportPeriod> => {
  const location = await scopedReportLocation(organizationId, locationId);
  const startsAt = zonedDayRange(from, location.timezone).startsAt;
  const endsAt = zonedDayRange(addDays(to, 1), location.timezone).startsAt;

  return {
    location,
    from,
    to,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
  };
};

const loadSales = async (organizationId: string, period: ReportPeriod): Promise<ReportSaleRow[]> =>
  prisma.sale.findMany({
    where: {
      organizationId,
      locationId: period.location.id,
      status: { not: 'VOIDED' },
      createdAt: { gte: new Date(period.startsAt), lt: new Date(period.endsAt) },
    },
    select: reportSaleSelection,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

const loadAppointments = async (
  organizationId: string,
  period: ReportPeriod,
): Promise<ReportAppointmentRow[]> =>
  prisma.appointment.findMany({
    where: {
      organizationId,
      locationId: period.location.id,
      startsAt: { gte: new Date(period.startsAt), lt: new Date(period.endsAt) },
    },
    select: reportAppointmentSelection,
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
  });

const topItemsOf = (sales: readonly ReportSaleRow[]): ReportItem[] => {
  const items = new Map<string, ReportItem>();

  for (const sale of sales) {
    for (const line of sale.lines) {
      const itemId = line.serviceId ?? line.productId;
      const key = `${line.type}:${itemId ?? line.name}`;
      const current = items.get(key) ?? {
        type: line.type,
        itemId,
        name: line.name,
        quantity: 0,
        grossInCents: 0,
      };
      current.name = line.name;
      current.quantity += line.quantity;
      current.grossInCents += line.totalInCents;
      items.set(key, current);
    }
  }

  return [...items.values()].sort(
    (left, right) => right.grossInCents - left.grossInCents || right.quantity - left.quantity,
  );
};

export const dashboardFor = async (
  organizationId: string,
  locationId: string,
  date: string,
): Promise<DashboardData> => {
  const period = await reportPeriod(organizationId, locationId, date, date);
  const [sales, allAppointments] = await Promise.all([
    loadSales(organizationId, period),
    loadAppointments(organizationId, period),
  ]);
  const netSalesInCents = sum(sales.map((sale) => sale.totalInCents - sale.refundedInCents));
  const uniquePayingCustomers = new Set(
    sales
      .map((sale) => sale.customerId)
      .filter((customerId): customerId is string => customerId !== null),
  );

  return {
    period,
    kpis: {
      netSalesInCents,
      appointmentCount: allAppointments.length,
      uniquePayingCustomers: uniquePayingCustomers.size,
      averageTicketInCents: average(netSalesInCents, sales.length),
    },
    appointments: allAppointments.slice(0, 8).map((appointment) => ({
      id: appointment.id,
      startsAt: appointment.startsAt.toISOString(),
      endsAt: appointment.endsAt.toISOString(),
      customerName: displayName(appointment.customer),
      serviceNames: appointment.services.map((service) => service.name),
      durationMinutes: Math.round(
        (appointment.endsAt.getTime() - appointment.startsAt.getTime()) / 60_000,
      ),
      staffName:
        appointment.staffProfile.displayName?.trim() ||
        displayName(appointment.staffProfile.membership.user),
      status: appointment.status,
    })),
    recentSales: [...sales]
      .reverse()
      .slice(0, 6)
      .map((sale) => ({
        id: sale.id,
        receiptCode: sale.receiptCode,
        customerName: sale.customer ? displayName(sale.customer) : null,
        totalInCents: sale.totalInCents,
        refundedInCents: sale.refundedInCents,
        createdAt: sale.createdAt.toISOString(),
      })),
    topItems: topItemsOf(sales).slice(0, 6),
  };
};

export const revenueReport = async (
  organizationId: string,
  locationId: string,
  from: string,
  to: string,
): Promise<RevenueReportData> => {
  const period = await reportPeriod(organizationId, locationId, from, to);
  const sales = await loadSales(organizationId, period);
  const grossSalesInCents = sum(sales.map((sale) => sale.totalInCents));
  const refundedInCents = sum(sales.map((sale) => sale.refundedInCents));
  const netSalesInCents = grossSalesInCents - refundedInCents;
  const trend = new Map(
    datesBetween(from, to).map((date) => [
      date,
      { date, saleCount: 0, grossSalesInCents: 0, netSalesInCents: 0 },
    ]),
  );

  for (const sale of sales) {
    const date = zonedPartsAt(sale.createdAt, period.location.timezone).date;
    const point = trend.get(date);
    if (!point) continue;
    point.saleCount += 1;
    point.grossSalesInCents += sale.totalInCents;
    point.netSalesInCents += sale.totalInCents - sale.refundedInCents;
  }

  return {
    period,
    summary: {
      saleCount: sales.length,
      subtotalInCents: sum(sales.map((sale) => sale.subtotalInCents)),
      discountInCents: sum(sales.map((sale) => sale.discountInCents)),
      taxInCents: sum(sales.map((sale) => sale.taxInCents)),
      grossSalesInCents,
      refundedInCents,
      netSalesInCents,
      averageTicketInCents: average(netSalesInCents, sales.length),
      refundRatePercentage: percentage(refundedInCents, grossSalesInCents),
    },
    trend: [...trend.values()],
    topItems: topItemsOf(sales).slice(0, 10),
  };
};

const statusCounts = (appointments: readonly ReportAppointmentRow[]) => {
  const counts = Object.fromEntries(appointmentStatuses.map((status) => [status, 0])) as Record<
    (typeof appointmentStatuses)[number],
    number
  >;
  for (const appointment of appointments) counts[appointment.status] += 1;
  return counts;
};

const durationOf = (appointment: ReportAppointmentRow) =>
  sum(appointment.services.map((service) => service.durationMinutes));

export const appointmentReport = async (
  organizationId: string,
  locationId: string,
  from: string,
  to: string,
): Promise<AppointmentReportData> => {
  const period = await reportPeriod(organizationId, locationId, from, to);
  const appointments = await loadAppointments(organizationId, period);
  const counts = statusCounts(appointments);
  const total = appointments.length;
  const completed = appointments.filter((appointment) => appointment.status === 'COMPLETED');
  const trend = new Map(
    datesBetween(from, to).map((date) => [
      date,
      { date, total: 0, completed: 0, cancelled: 0, noShow: 0 },
    ]),
  );
  const hours = new Map<string, number>();
  const services = new Map<
    string,
    {
      serviceId: string;
      name: string;
      bookingCount: number;
      bookedValueInCents: number;
      bookedServiceMinutes: number;
    }
  >();

  for (const appointment of appointments) {
    const local = zonedPartsAt(appointment.startsAt, period.location.timezone);
    const point = trend.get(local.date);
    if (point) {
      point.total += 1;
      if (appointment.status === 'COMPLETED') point.completed += 1;
      if (appointment.status === 'CANCELLED') point.cancelled += 1;
      if (appointment.status === 'NO_SHOW') point.noShow += 1;
    }
    const hour = String(local.hour).padStart(2, '0');
    hours.set(hour, (hours.get(hour) ?? 0) + 1);

    for (const service of appointment.services) {
      const current = services.get(service.serviceId) ?? {
        serviceId: service.serviceId,
        name: service.name,
        bookingCount: 0,
        bookedValueInCents: 0,
        bookedServiceMinutes: 0,
      };
      current.bookingCount += 1;
      current.bookedValueInCents += service.priceInCents;
      current.bookedServiceMinutes += service.durationMinutes;
      services.set(service.serviceId, current);
    }
  }

  return {
    period,
    summary: {
      total,
      scheduled: counts.SCHEDULED,
      confirmed: counts.CONFIRMED,
      checkedIn: counts.CHECKED_IN,
      inProgress: counts.IN_PROGRESS,
      completed: counts.COMPLETED,
      cancelled: counts.CANCELLED,
      noShow: counts.NO_SHOW,
      completionRatePercentage: percentage(counts.COMPLETED, total),
      cancellationRatePercentage: percentage(counts.CANCELLED, total),
      noShowRatePercentage: percentage(counts.NO_SHOW, total),
      bookedServiceMinutes: sum(appointments.map(durationOf)),
      completedServiceMinutes: sum(completed.map(durationOf)),
    },
    trend: [...trend.values()],
    serviceDemand: [...services.values()].sort(
      (left, right) =>
        right.bookingCount - left.bookingCount ||
        right.bookedValueInCents - left.bookedValueInCents,
    ),
    peakHours: [...hours.entries()]
      .map(([hour, appointmentCount]) => ({ hour, appointmentCount }))
      .sort(
        (left, right) =>
          right.appointmentCount - left.appointmentCount || left.hour.localeCompare(right.hour),
      )
      .slice(0, 8),
  };
};

export const paymentReport = async (
  organizationId: string,
  locationId: string,
  from: string,
  to: string,
): Promise<PaymentReportData> => {
  const period = await reportPeriod(organizationId, locationId, from, to);
  const createdAt = { gte: new Date(period.startsAt), lt: new Date(period.endsAt) };
  const [payments, refunds] = await Promise.all([
    prisma.salePayment.findMany({
      where: {
        organizationId,
        createdAt,
        sale: { locationId: period.location.id, status: { not: 'VOIDED' } },
      },
      select: { method: true, amountInCents: true },
    }),
    prisma.saleRefund.findMany({
      where: {
        organizationId,
        createdAt,
        sale: { locationId: period.location.id, status: { not: 'VOIDED' } },
      },
      select: { method: true, amountInCents: true },
    }),
  ]);
  const tender = new Map<PaymentMethod, number>(paymentMethods.map((method) => [method, 0]));
  const refunded = new Map<PaymentMethod, number>(paymentMethods.map((method) => [method, 0]));
  for (const payment of payments)
    tender.set(payment.method, (tender.get(payment.method) ?? 0) + payment.amountInCents);
  for (const refund of refunds)
    refunded.set(refund.method, (refunded.get(refund.method) ?? 0) + refund.amountInCents);
  const tenderInCents = sum([...tender.values()]);
  const refundInCents = sum([...refunded.values()]);

  return {
    period,
    tenderInCents,
    refundInCents,
    netInCents: tenderInCents - refundInCents,
    methods: paymentMethods.map((method) => ({
      method,
      tenderInCents: tender.get(method) ?? 0,
      refundInCents: refunded.get(method) ?? 0,
      netInCents: (tender.get(method) ?? 0) - (refunded.get(method) ?? 0),
    })),
  };
};

export const staffReport = async (
  organizationId: string,
  locationId: string,
  from: string,
  to: string,
): Promise<StaffReportData> => {
  const period = await reportPeriod(organizationId, locationId, from, to);
  const createdAt = { gte: new Date(period.startsAt), lt: new Date(period.endsAt) };
  const [staffRows, appointments, saleLines] = await Promise.all([
    prisma.staffProfile.findMany({
      where: { organizationId },
      select: reportStaffSelection,
      orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
    }),
    prisma.appointment.findMany({
      where: {
        organizationId,
        locationId: period.location.id,
        startsAt: { gte: createdAt.gte, lt: createdAt.lt },
      },
      select: {
        staffProfileId: true,
        customerId: true,
        status: true,
        services: { select: { durationMinutes: true } },
      },
    }),
    prisma.saleLine.findMany({
      where: {
        organizationId,
        type: 'SERVICE',
        staffProfileId: { not: null },
        sale: {
          locationId: period.location.id,
          status: { not: 'VOIDED' },
          createdAt,
        },
      },
      select: { staffProfileId: true, saleId: true, totalInCents: true },
    }),
  ]);

  const metrics = new Map<
    string,
    {
      appointments: number;
      completed: number;
      cancelled: number;
      noShow: number;
      bookedMinutes: number;
      completedMinutes: number;
      customers: Set<string>;
      saleIds: Set<string>;
      salesInCents: number;
    }
  >();
  const emptyMetrics = () => ({
    appointments: 0,
    completed: 0,
    cancelled: 0,
    noShow: 0,
    bookedMinutes: 0,
    completedMinutes: 0,
    customers: new Set<string>(),
    saleIds: new Set<string>(),
    salesInCents: 0,
  });
  for (const staff of staffRows) metrics.set(staff.id, emptyMetrics());

  for (const appointment of appointments) {
    const row = metrics.get(appointment.staffProfileId);
    if (!row) continue;
    const minutes = sum(appointment.services.map((service) => service.durationMinutes));
    row.appointments += 1;
    row.bookedMinutes += minutes;
    row.customers.add(appointment.customerId);
    if (appointment.status === 'COMPLETED') {
      row.completed += 1;
      row.completedMinutes += minutes;
    }
    if (appointment.status === 'CANCELLED') row.cancelled += 1;
    if (appointment.status === 'NO_SHOW') row.noShow += 1;
  }
  for (const line of saleLines) {
    if (!line.staffProfileId) continue;
    const row = metrics.get(line.staffProfileId);
    if (!row) continue;
    row.saleIds.add(line.saleId);
    row.salesInCents += line.totalInCents;
  }

  return {
    period,
    staff: staffRows
      .filter((staff) => {
        const row = metrics.get(staff.id);
        return (
          staff.isActive || (row !== undefined && (row.appointments > 0 || row.saleIds.size > 0))
        );
      })
      .map((staff) => {
        const row = metrics.get(staff.id) ?? emptyMetrics();
        return {
          staffProfileId: staff.id,
          name: staff.displayName?.trim() || displayName(staff.membership.user),
          appointmentCount: row.appointments,
          completedAppointmentCount: row.completed,
          cancelledAppointmentCount: row.cancelled,
          noShowAppointmentCount: row.noShow,
          bookedServiceMinutes: row.bookedMinutes,
          completedServiceMinutes: row.completedMinutes,
          uniqueCustomerCount: row.customers.size,
          attributedSaleCount: row.saleIds.size,
          attributedSalesInCents: row.salesInCents,
        };
      })
      .sort(
        (left, right) =>
          right.attributedSalesInCents - left.attributedSalesInCents ||
          right.completedAppointmentCount - left.completedAppointmentCount ||
          left.name.localeCompare(right.name),
      ),
  };
};
