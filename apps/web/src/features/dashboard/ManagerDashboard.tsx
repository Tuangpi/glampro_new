import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight, DollarSign, TrendingUp, Users } from 'lucide-react';
import type { DashboardData } from '@glampro/contracts';
import { appointmentStatusLabels, appointmentStatusTone } from '../appointments/appointmentView';
import { StatusMessage } from '../shared/FormControls';
import { apiErrorMessage, fetchDashboard } from '../../lib/api';
import { formatMoney, formatTimeInZone } from '../../lib/format';

const money = (amountInCents: number, currency: string) => formatMoney(amountInCents, currency);

export const ManagerDashboard = ({
  locationId,
  date,
  timezone,
}: {
  locationId: string;
  date: string;
  timezone: string;
}) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setData(null);
    fetchDashboard({ locationId, date })
      .then((dashboard) => {
        if (active) {
          setData(dashboard);
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

  if (error) return <StatusMessage tone="error">{error}</StatusMessage>;
  if (!data)
    return <p className="text-xs font-bold text-muted">Loading today&apos;s live figures…</p>;

  const { kpis, period } = data;
  const currency = period.location.currency;
  const cards = [
    {
      label: "Today's net sales",
      value: money(kpis.netSalesInCents, currency),
      icon: DollarSign,
      highlight: true,
    },
    {
      label: 'Appointments',
      value: String(kpis.appointmentCount),
      icon: CalendarDays,
      highlight: false,
    },
    {
      label: 'Paying customers',
      value: String(kpis.uniquePayingCustomers),
      icon: Users,
      highlight: false,
    },
    {
      label: 'Average ticket',
      value: money(kpis.averageTicketInCents, currency),
      icon: TrendingUp,
      highlight: false,
    },
  ] as const;

  return (
    <>
      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Today's key figures"
      >
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article
              key={card.label}
              className={
                card.highlight
                  ? 'flex flex-col gap-2 rounded-[18px] bg-gradient-to-br from-[#FFC94D] to-[#FFB020] p-4 text-white'
                  : 'flex flex-col gap-2 rounded-[18px] border border-line bg-white p-4'
              }
            >
              <span
                className={
                  card.highlight
                    ? 'flex h-8 w-8 items-center justify-center rounded-[9px] bg-white/25'
                    : 'flex h-8 w-8 items-center justify-center rounded-[9px] bg-[#F1ECFF] text-brand'
                }
              >
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <p
                className={
                  card.highlight
                    ? 'text-xs font-bold text-white/85'
                    : 'text-xs font-bold text-muted'
                }
              >
                {card.label}
              </p>
              <p className="text-2xl font-extrabold">{card.value}</p>
            </article>
          );
        })}
      </section>
      <ManagerLists data={data} timezone={timezone} />
    </>
  );
};

const ManagerLists = ({ data, timezone }: { data: DashboardData; timezone: string }) => {
  const currency = data.period.location.currency;
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <section className="panel p-5">
        <header className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-extrabold">Today&apos;s appointments</h2>
          <Link to="/appointments" className="flex items-center gap-1 text-xs font-bold text-brand">
            View calendar <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </header>
        {data.appointments.length === 0 ? (
          <p className="mt-4 text-xs font-bold text-muted">No visits are booked for today.</p>
        ) : (
          <ul className="mt-4 flex flex-col divide-y divide-line">
            {data.appointments.map((appointment) => (
              <li
                key={appointment.id}
                className="grid grid-cols-[54px_minmax(0,1fr)_auto] items-center gap-3 py-3"
              >
                <span className="text-xs font-extrabold text-muted">
                  {formatTimeInZone(appointment.startsAt, timezone)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-extrabold">
                    {appointment.customerName}
                  </span>
                  <span className="block truncate text-[11px] text-muted">
                    {appointment.serviceNames.join(' · ')} · {appointment.durationMinutes} min ·{' '}
                    {appointment.staffName}
                  </span>
                </span>
                <span
                  className={['status-pill', appointmentStatusTone(appointment.status)].join(' ')}
                >
                  {appointmentStatusLabels[appointment.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="flex flex-col gap-5">
        <section className="panel p-5">
          <header className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-extrabold">Today&apos;s sales</h2>
            <Link to="/sales" className="text-xs font-bold text-brand">
              View all
            </Link>
          </header>
          {data.recentSales.length === 0 ? (
            <p className="mt-4 text-xs font-bold text-muted">No sales have been recorded today.</p>
          ) : (
            <ul className="mt-4 flex flex-col divide-y divide-line">
              {data.recentSales.map((sale) => (
                <li key={sale.id} className="flex items-center gap-3 py-2.5 text-xs">
                  <span className="font-extrabold text-muted">{sale.receiptCode}</span>
                  <span className="min-w-0 flex-1 truncate font-bold">
                    {sale.customerName ?? 'Walk-in'}
                  </span>
                  <span className="font-extrabold">
                    {money(sale.totalInCents - sale.refundedInCents, currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel p-5">
          <h2 className="text-sm font-extrabold">Top selling today</h2>
          {data.topItems.length === 0 ? (
            <p className="mt-4 text-xs font-bold text-muted">No items have sold today.</p>
          ) : (
            <ol className="mt-4 flex flex-col gap-2">
              {data.topItems.map((item, index) => (
                <li
                  key={`${item.type}:${item.itemId ?? item.name}`}
                  className="flex items-center gap-3 text-xs"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-canvas text-[10px] font-extrabold text-muted">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-bold">{item.name}</span>
                  <span className="text-muted">×{item.quantity}</span>
                  <span className="font-extrabold">{money(item.grossInCents, currency)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
};
