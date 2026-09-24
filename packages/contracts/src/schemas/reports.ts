import { z } from 'zod';
import { apiEnvelopeSchema } from './api.js';
import { appointmentStatusSchema } from './appointments.js';
import { locationSummarySchema } from './organization.js';
import { paymentMethodSchema, saleLineTypeSchema } from './sales.js';

/** Reports are bounded to one location and at most 366 local calendar days. */
const idSchema = z.string().trim().min(1).max(64);
const moneySchema = z.number().int().min(0).max(1_000_000_000_000);
const signedMoneySchema = z.number().int().min(-1_000_000_000_000).max(1_000_000_000_000);
const countSchema = z.number().int().min(0).max(1_000_000_000);
const percentageSchema = z.number().min(0).max(100);

const calendarDayCount = (from: string, to: string) =>
  Math.round(
    (new Date(`${to}T00:00:00.000Z`).getTime() - new Date(`${from}T00:00:00.000Z`).getTime()) /
      86_400_000,
  ) + 1;

export const dashboardQuerySchema = z.object({
  locationId: idSchema,
  date: z.iso.date(),
});

export const reportQuerySchema = z
  .object({
    locationId: idSchema,
    /** Both bounds are inclusive local calendar days. */
    from: z.iso.date(),
    to: z.iso.date(),
  })
  .superRefine((value, context) => {
    const days = calendarDayCount(value.from, value.to);
    if (days < 1) {
      context.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'The report end date must not be before its start date',
      });
    } else if (days > 366) {
      context.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'A report cannot span more than 366 days',
      });
    }
  });

export const reportPeriodSchema = z.object({
  location: locationSummarySchema,
  from: z.iso.date(),
  to: z.iso.date(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
});

export const dashboardKpisSchema = z.object({
  netSalesInCents: moneySchema,
  appointmentCount: countSchema,
  uniquePayingCustomers: countSchema,
  averageTicketInCents: moneySchema,
});

export const dashboardAppointmentSchema = z.object({
  id: z.string().min(1),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  customerName: z.string().min(1),
  serviceNames: z.array(z.string().min(1)).min(1),
  durationMinutes: countSchema,
  staffName: z.string().min(1),
  status: appointmentStatusSchema,
});

export const dashboardSaleSchema = z.object({
  id: z.string().min(1),
  receiptCode: z.string().min(1),
  customerName: z.string().nullable(),
  totalInCents: moneySchema,
  refundedInCents: moneySchema,
  createdAt: z.iso.datetime(),
});

export const reportItemSchema = z.object({
  type: saleLineTypeSchema,
  itemId: z.string().nullable(),
  name: z.string().min(1),
  quantity: countSchema,
  grossInCents: moneySchema,
});

export const dashboardDataSchema = z.object({
  period: reportPeriodSchema,
  kpis: dashboardKpisSchema,
  appointments: z.array(dashboardAppointmentSchema),
  recentSales: z.array(dashboardSaleSchema),
  topItems: z.array(reportItemSchema),
});

export const revenueSummarySchema = z.object({
  saleCount: countSchema,
  subtotalInCents: moneySchema,
  discountInCents: moneySchema,
  taxInCents: moneySchema,
  grossSalesInCents: moneySchema,
  refundedInCents: moneySchema,
  netSalesInCents: moneySchema,
  averageTicketInCents: moneySchema,
  refundRatePercentage: percentageSchema,
});

export const revenueTrendPointSchema = z.object({
  date: z.iso.date(),
  saleCount: countSchema,
  grossSalesInCents: moneySchema,
  netSalesInCents: moneySchema,
});

export const revenueReportDataSchema = z.object({
  period: reportPeriodSchema,
  summary: revenueSummarySchema,
  trend: z.array(revenueTrendPointSchema),
  topItems: z.array(reportItemSchema),
});

export const appointmentReportSummarySchema = z.object({
  total: countSchema,
  scheduled: countSchema,
  confirmed: countSchema,
  checkedIn: countSchema,
  inProgress: countSchema,
  completed: countSchema,
  cancelled: countSchema,
  noShow: countSchema,
  completionRatePercentage: percentageSchema,
  cancellationRatePercentage: percentageSchema,
  noShowRatePercentage: percentageSchema,
  bookedServiceMinutes: countSchema,
  completedServiceMinutes: countSchema,
});

export const appointmentTrendPointSchema = z.object({
  date: z.iso.date(),
  total: countSchema,
  completed: countSchema,
  cancelled: countSchema,
  noShow: countSchema,
});

export const serviceDemandSchema = z.object({
  serviceId: z.string().min(1),
  name: z.string().min(1),
  bookingCount: countSchema,
  bookedValueInCents: moneySchema,
  bookedServiceMinutes: countSchema,
});

export const appointmentPeakHourSchema = z.object({
  hour: z.string().regex(/^([01]\d|2[0-3])$/),
  appointmentCount: countSchema,
});

export const appointmentReportDataSchema = z.object({
  period: reportPeriodSchema,
  summary: appointmentReportSummarySchema,
  trend: z.array(appointmentTrendPointSchema),
  serviceDemand: z.array(serviceDemandSchema),
  peakHours: z.array(appointmentPeakHourSchema),
});

export const paymentMethodReportRowSchema = z.object({
  method: paymentMethodSchema,
  tenderInCents: moneySchema,
  refundInCents: moneySchema,
  netInCents: signedMoneySchema,
});

export const paymentReportDataSchema = z.object({
  period: reportPeriodSchema,
  tenderInCents: moneySchema,
  refundInCents: moneySchema,
  netInCents: signedMoneySchema,
  methods: z.array(paymentMethodReportRowSchema),
});

export const staffPerformanceRowSchema = z.object({
  staffProfileId: z.string().min(1),
  name: z.string().min(1),
  appointmentCount: countSchema,
  completedAppointmentCount: countSchema,
  cancelledAppointmentCount: countSchema,
  noShowAppointmentCount: countSchema,
  bookedServiceMinutes: countSchema,
  completedServiceMinutes: countSchema,
  uniqueCustomerCount: countSchema,
  attributedSaleCount: countSchema,
  attributedSalesInCents: moneySchema,
});

export const staffReportDataSchema = z.object({
  period: reportPeriodSchema,
  staff: z.array(staffPerformanceRowSchema),
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
export type ReportQuery = z.infer<typeof reportQuerySchema>;
export type ReportPeriod = z.infer<typeof reportPeriodSchema>;
export type DashboardKpis = z.infer<typeof dashboardKpisSchema>;
export type DashboardAppointment = z.infer<typeof dashboardAppointmentSchema>;
export type DashboardSale = z.infer<typeof dashboardSaleSchema>;
export type ReportItem = z.infer<typeof reportItemSchema>;
export type DashboardData = z.infer<typeof dashboardDataSchema>;
export type RevenueSummary = z.infer<typeof revenueSummarySchema>;
export type RevenueTrendPoint = z.infer<typeof revenueTrendPointSchema>;
export type RevenueReportData = z.infer<typeof revenueReportDataSchema>;
export type AppointmentReportSummary = z.infer<typeof appointmentReportSummarySchema>;
export type AppointmentTrendPoint = z.infer<typeof appointmentTrendPointSchema>;
export type ServiceDemand = z.infer<typeof serviceDemandSchema>;
export type AppointmentPeakHour = z.infer<typeof appointmentPeakHourSchema>;
export type AppointmentReportData = z.infer<typeof appointmentReportDataSchema>;
export type PaymentMethodReportRow = z.infer<typeof paymentMethodReportRowSchema>;
export type PaymentReportData = z.infer<typeof paymentReportDataSchema>;
export type StaffPerformanceRow = z.infer<typeof staffPerformanceRowSchema>;
export type StaffReportData = z.infer<typeof staffReportDataSchema>;

export const dashboardResponseDataSchema = z.object({ dashboard: dashboardDataSchema });
export const revenueReportResponseDataSchema = z.object({ revenue: revenueReportDataSchema });
export const appointmentReportResponseDataSchema = z.object({
  appointments: appointmentReportDataSchema,
});
export const paymentReportResponseDataSchema = z.object({ payments: paymentReportDataSchema });
export const staffReportResponseDataSchema = z.object({ staff: staffReportDataSchema });

export const dashboardResponseSchema = apiEnvelopeSchema(dashboardResponseDataSchema);
export const revenueReportResponseSchema = apiEnvelopeSchema(revenueReportResponseDataSchema);
export const appointmentReportResponseSchema = apiEnvelopeSchema(
  appointmentReportResponseDataSchema,
);
export const paymentReportResponseSchema = apiEnvelopeSchema(paymentReportResponseDataSchema);
export const staffReportResponseSchema = apiEnvelopeSchema(staffReportResponseDataSchema);
