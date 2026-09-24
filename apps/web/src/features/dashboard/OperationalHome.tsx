import { useEffect, useState } from 'react';
import { Clock3 } from 'lucide-react';
import type { AppointmentSummary, SaleSummary } from '@glampro/contracts';
import { apiErrorMessage, fetchAppointments, fetchSales } from '../../lib/api';
import { formatMoney, formatTimeInZone } from '../../lib/format';
import { StatusMessage } from '../shared/FormControls';

/** Reduced home for roles that can work the diary and POS but cannot view reports. */
export const OperationalHome = ({
  locationId,
  date,
  timezone,
}: {
  locationId: string;
  date: string;
  timezone: string;
}) => {
  const [appointments, setAppointments] = useState<AppointmentSummary[]>([]);
  const [sales, setSales] = useState<SaleSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([fetchAppointments({ date, locationId }), fetchSales({ locationId, limit: 6 })])
      .then(([appointmentData, saleData]) => {
        if (active) {
          setAppointments(appointmentData.appointments);
          setSales(saleData.sales);
          setError(null);
        }
      })
      .catch((loadError: unknown) => {
        if (active) setError(apiErrorMessage(loadError));
      });
    return () => {
      active = false;
    };
  }, [date, locationId]);

  return (
    <>
      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ['Appointments today', String(appointments.length)],
          ['Recent receipts', String(sales.length)],
          ['Local day', date],
        ].map(([label, value]) => (
          <article key={label} className="panel p-5">
            <p className="text-xs font-bold text-muted">{label}</p>
            <p className="mt-2 text-2xl font-extrabold">{value}</p>
          </article>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="panel p-5">
          <h2 className="text-sm font-extrabold">Today&apos;s diary</h2>
          {appointments.length === 0 ? (
            <p className="mt-4 text-xs font-bold text-muted">No visits are booked for today.</p>
          ) : (
            <ul className="mt-4 flex flex-col divide-y divide-line">
              {appointments.slice(0, 8).map((appointment) => (
                <li key={appointment.id} className="flex items-center gap-3 py-3 text-xs">
                  <Clock3 className="h-4 w-4 text-brand" aria-hidden />
                  <span className="font-extrabold">
                    {formatTimeInZone(appointment.startsAt, timezone)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-bold">
                    {appointment.customer.firstName} ·{' '}
                    {appointment.services.map((service) => service.name).join(', ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel p-5">
          <h2 className="text-sm font-extrabold">Recent sales</h2>
          {sales.length === 0 ? (
            <p className="mt-4 text-xs font-bold text-muted">No sales have been recorded yet.</p>
          ) : (
            <ul className="mt-4 flex flex-col divide-y divide-line">
              {sales.map((sale) => (
                <li key={sale.id} className="flex items-center gap-3 py-2.5 text-xs">
                  <span className="font-extrabold text-muted">{sale.receiptCode}</span>
                  <span className="min-w-0 flex-1 truncate font-bold">
                    {sale.customer
                      ? `${sale.customer.firstName} ${sale.customer.lastName ?? ''}`.trim()
                      : 'Walk-in'}
                  </span>
                  <span className="font-extrabold">
                    {formatMoney(sale.totalInCents - sale.refundedInCents, sale.location.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
};
