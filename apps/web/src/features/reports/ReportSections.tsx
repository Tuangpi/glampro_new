import type {
  AppointmentReportData,
  PaymentReportData,
  RevenueReportData,
  StaffReportData,
} from '@glampro/contracts';
import { formatMoney } from '../../lib/format';
import { paymentMethodLabels } from '../sales/saleView';
import { EmptyReport, ReportBarChart, ReportMetric, ReportTable } from './ReportPrimitives';
import { formatMinutes } from './reportView';

const dayLabel = (date: string) =>
  new Intl.DateTimeFormat('en-SG', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00.000Z`),
  );

export const RevenueSection = ({ report }: { report: RevenueReportData }) => {
  const { summary, period } = report;
  const money = (value: number) => formatMoney(value, period.location.currency);
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ReportMetric label="Net sales" value={money(summary.netSalesInCents)} />
        <ReportMetric label="Gross sales" value={money(summary.grossSalesInCents)} />
        <ReportMetric
          label="Refunds"
          value={money(summary.refundedInCents)}
          note={`${summary.refundRatePercentage}% of gross`}
        />
        <ReportMetric
          label="Average ticket"
          value={money(summary.averageTicketInCents)}
          note={`${summary.saleCount} non-voided sales`}
        />
      </div>
      <ReportBarChart
        title="Revenue trend"
        valueLabel="Net sales"
        secondaryLabel="Gross sales"
        formatValue={money}
        points={report.trend.map((point) => ({
          key: point.date,
          label: dayLabel(point.date),
          value: point.netSalesInCents,
          secondary: point.grossSalesInCents,
        }))}
      />
      <section className="panel p-5">
        <h2 className="text-sm font-extrabold">Top items</h2>
        {report.topItems.length === 0 ? (
          <EmptyReport>No items sold in this period.</EmptyReport>
        ) : (
          <ReportTable>
            <thead>
              <tr className="border-b border-line text-[10px] uppercase tracking-wider text-muted">
                <th className="pb-3">Item</th>
                <th className="pb-3">Type</th>
                <th className="pb-3 text-right">Quantity</th>
                <th className="pb-3 text-right">Gross</th>
              </tr>
            </thead>
            <tbody>
              {report.topItems.map((item) => (
                <tr
                  key={`${item.type}:${item.itemId ?? item.name}`}
                  className="border-b border-line last:border-0"
                >
                  <td className="py-3 font-extrabold">{item.name}</td>
                  <td className="py-3 text-muted">
                    {item.type === 'SERVICE' ? 'Service' : 'Product'}
                  </td>
                  <td className="py-3 text-right">×{item.quantity}</td>
                  <td className="py-3 text-right font-extrabold">{money(item.grossInCents)}</td>
                </tr>
              ))}
            </tbody>
          </ReportTable>
        )}
      </section>
    </div>
  );
};

export const AppointmentSection = ({ report }: { report: AppointmentReportData }) => {
  const { summary } = report;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ReportMetric label="Appointments" value={String(summary.total)} />
        <ReportMetric
          label="Completed"
          value={String(summary.completed)}
          note={`${summary.completionRatePercentage}% completion`}
        />
        <ReportMetric
          label="No-show rate"
          value={`${summary.noShowRatePercentage}%`}
          note={`${summary.noShow} visits`}
        />
        <ReportMetric
          label="Booked service time"
          value={formatMinutes(summary.bookedServiceMinutes)}
          note={`${formatMinutes(summary.completedServiceMinutes)} completed`}
        />
      </div>
      <ReportBarChart
        title="Appointment trend"
        valueLabel="Appointments"
        secondaryLabel="Completed"
        formatValue={(value) => String(value)}
        points={report.trend.map((point) => ({
          key: point.date,
          label: dayLabel(point.date),
          value: point.total,
          secondary: point.completed,
        }))}
      />
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="panel p-5">
          <h2 className="text-sm font-extrabold">Service demand</h2>
          {report.serviceDemand.length === 0 ? (
            <EmptyReport>No services booked in this period.</EmptyReport>
          ) : (
            <ReportTable>
              <thead>
                <tr className="border-b border-line text-[10px] uppercase tracking-wider text-muted">
                  <th className="pb-3">Service</th>
                  <th className="pb-3 text-right">Bookings</th>
                  <th className="pb-3 text-right">Time</th>
                </tr>
              </thead>
              <tbody>
                {report.serviceDemand.map((service) => (
                  <tr key={service.serviceId} className="border-b border-line last:border-0">
                    <td className="py-3 font-extrabold">{service.name}</td>
                    <td className="py-3 text-right">{service.bookingCount}</td>
                    <td className="py-3 text-right">
                      {formatMinutes(service.bookedServiceMinutes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </ReportTable>
          )}
        </section>
        <section className="panel p-5">
          <h2 className="text-sm font-extrabold">Peak appointment hours</h2>
          {report.peakHours.length === 0 ? (
            <EmptyReport>No appointment times to rank.</EmptyReport>
          ) : (
            <ol className="mt-4 flex flex-col gap-3">
              {report.peakHours.map((peak, index) => (
                <li key={peak.hour} className="flex items-center gap-3 text-xs">
                  <span className="w-5 text-[10px] font-extrabold text-muted">{index + 1}</span>
                  <span className="font-extrabold">{peak.hour}:00</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-canvas">
                    <span
                      className="block h-full rounded-full bg-brand"
                      style={{
                        width: `${Math.max(4, (peak.appointmentCount / report.peakHours[0]!.appointmentCount) * 100)}%`,
                      }}
                    />
                  </span>
                  <span className="font-bold text-muted">{peak.appointmentCount}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
};

export const PaymentSection = ({ report }: { report: PaymentReportData }) => {
  const money = (value: number) => formatMoney(value, report.period.location.currency);
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <ReportMetric label="Tender received" value={money(report.tenderInCents)} />
        <ReportMetric label="Refunds processed" value={money(report.refundInCents)} />
        <ReportMetric
          label="Net movement"
          value={money(report.netInCents)}
          note="A negative method means refunds exceeded tenders in this period."
        />
      </div>
      <section className="panel p-5">
        <h2 className="text-sm font-extrabold">Payment methods</h2>
        <ReportTable>
          <thead>
            <tr className="border-b border-line text-[10px] uppercase tracking-wider text-muted">
              <th className="pb-3">Method</th>
              <th className="pb-3 text-right">Tender</th>
              <th className="pb-3 text-right">Refunds</th>
              <th className="pb-3 text-right">Net</th>
            </tr>
          </thead>
          <tbody>
            {report.methods.map((row) => (
              <tr key={row.method} className="border-b border-line last:border-0">
                <td className="py-3 font-extrabold">{paymentMethodLabels[row.method]}</td>
                <td className="py-3 text-right">{money(row.tenderInCents)}</td>
                <td className="py-3 text-right">{money(row.refundInCents)}</td>
                <td
                  className={[
                    'py-3 text-right font-extrabold',
                    row.netInCents < 0 ? 'text-[#B26B00]' : '',
                  ].join(' ')}
                >
                  {money(row.netInCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      </section>
    </div>
  );
};

export const StaffSection = ({ report }: { report: StaffReportData }) => {
  const money = (value: number) => formatMoney(value, report.period.location.currency);
  return (
    <section className="panel p-5">
      <header>
        <h2 className="text-sm font-extrabold">Staff performance</h2>
        <p className="mt-1 text-xs text-muted">
          Sales are gross service lines explicitly attributed to each stylist; refunds are not
          allocated because the ledger does not assign refund money to staff.
        </p>
      </header>
      {report.staff.length === 0 ? (
        <EmptyReport>No active staff profiles are available.</EmptyReport>
      ) : (
        <ReportTable>
          <thead>
            <tr className="border-b border-line text-[10px] uppercase tracking-wider text-muted">
              <th className="pb-3">Staff</th>
              <th className="pb-3 text-right">Completed</th>
              <th className="pb-3 text-right">Customers</th>
              <th className="pb-3 text-right">Service time</th>
              <th className="pb-3 text-right">Attributed sales</th>
            </tr>
          </thead>
          <tbody>
            {report.staff.map((staff) => (
              <tr key={staff.staffProfileId} className="border-b border-line last:border-0">
                <td className="py-3 font-extrabold">{staff.name}</td>
                <td className="py-3 text-right">
                  {staff.completedAppointmentCount} / {staff.appointmentCount}
                </td>
                <td className="py-3 text-right">{staff.uniqueCustomerCount}</td>
                <td className="py-3 text-right">{formatMinutes(staff.completedServiceMinutes)}</td>
                <td className="py-3 text-right font-extrabold">
                  {money(staff.attributedSalesInCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </ReportTable>
      )}
    </section>
  );
};
