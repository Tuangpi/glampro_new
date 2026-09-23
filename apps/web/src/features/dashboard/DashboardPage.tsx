import { useEffect, useState } from 'react';
import { ArrowUpRight, CalendarDays, DollarSign, TrendingUp, Users } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { getApiHealth } from '../../lib/api';
import { formatSgd } from '../../lib/format';

const kpis = [
  { label: "Today's income", value: formatSgd(428_600), icon: DollarSign, highlight: true },
  { label: 'Appointments', value: '18', icon: CalendarDays, highlight: false },
  { label: 'Unique customers', value: '16', icon: Users, highlight: false },
  { label: 'Average ticket', value: formatSgd(14_600), icon: TrendingUp, highlight: false },
] as const;

const appointments = [
  {
    time: '09:00',
    name: 'David Lim',
    service: 'Keratin Treatment · 120 min',
    staff: 'Jia Ting',
    status: 'Finished',
  },
  {
    time: '10:00',
    name: 'Priya Y.',
    service: 'Deep Conditioning · 30 min',
    staff: 'Ravi K.',
    status: 'Finished',
  },
  {
    time: '11:15',
    name: 'Mrs Loi',
    service: 'Signature Haircut · 45 min',
    staff: 'Sam Liang',
    status: 'In salon',
  },
  {
    time: '13:00',
    name: 'Irene Foo',
    service: 'Colour Retouch · 90 min',
    staff: 'Jia Ting',
    status: 'Upcoming',
  },
  {
    time: '14:15',
    name: 'Sarah Ho',
    service: 'Blow Dry & Style · 35 min',
    staff: 'Sam Liang',
    status: 'Upcoming',
  },
] as const;

const sales = [
  { id: '#242723', name: 'Irene Foo', amount: 14_600 },
  { id: '#242722', name: 'Mrs Loi', amount: 8_800 },
  { id: '#242721', name: 'David Lim', amount: 22_800 },
  { id: '#242720', name: 'Priya Y.', amount: 4_500 },
  { id: '#242719', name: 'Walk-in', amount: 6_200 },
] as const;

const topItems = [
  { name: 'Signature Haircut', quantity: 9, revenue: 52_200 },
  { name: 'Magken Shampoo', quantity: 6, revenue: 52_800 },
  { name: 'Colour Retouch', quantity: 3, revenue: 38_400 },
] as const;

const statusTone: Record<string, string> = {
  Finished: 'bg-[#E9F7F0] text-[#1C8A5A]',
  'In salon': 'bg-[#F1ECFF] text-brand',
  Upcoming: 'bg-[#FFF4DE] text-[#B26B00]',
};

const ApiStatusCard = () => {
  const [status, setStatus] = useState('Checking API…');

  useEffect(() => {
    let active = true;

    getApiHealth()
      .then((health) => {
        if (active) {
          setStatus(`Connected · ${health.data.service}`);
        }
      })
      .catch(() => {
        if (active) {
          setStatus('API unavailable — start the API to load live data');
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-xs font-bold text-muted">
      <span>{status}</span>
      <span className="status-pill bg-canvas text-[#2B3160]">SGD · Asia/Singapore</span>
    </div>
  );
};

export const DashboardPage = () => (
  <>
    <PageHeader
      title="Dashboard"
      subtitle="Friday, 18 September 2026"
      actions={
        <button className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-extrabold text-white shadow-brand">
          New sale
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      }
    />

    <div className="flex flex-col gap-5 p-5 sm:p-7">
      <ApiStatusCard />

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Today's key figures"
      >
        {kpis.map((kpi) => {
          const Icon = kpi.icon;

          return (
            <article
              key={kpi.label}
              className={[
                'flex flex-col gap-2 rounded-[18px] p-4',
                kpi.highlight
                  ? 'bg-gradient-to-br from-[#FFC94D] to-[#FFB020] text-white'
                  : 'border border-line bg-white',
              ].join(' ')}
            >
              <span
                className={[
                  'flex h-8 w-8 items-center justify-center rounded-[9px]',
                  kpi.highlight ? 'bg-white/25' : 'bg-[#F1ECFF] text-brand',
                ].join(' ')}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <p
                className={[
                  'text-xs font-bold',
                  kpi.highlight ? 'text-white/85' : 'text-muted',
                ].join(' ')}
              >
                {kpi.label}
              </p>
              <p className="text-2xl font-extrabold">{kpi.value}</p>
            </article>
          );
        })}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="panel p-5">
          <header className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-extrabold">Today&apos;s appointments</h2>
            <span className="text-xs font-bold text-brand">View calendar</span>
          </header>
          <ul className="mt-4 flex flex-col divide-y divide-line">
            {appointments.map((appointment) => (
              <li
                key={`${appointment.time}-${appointment.name}`}
                className="grid grid-cols-[54px_minmax(0,1fr)_auto] items-center gap-3 py-3"
              >
                <span className="text-xs font-extrabold text-muted">{appointment.time}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-extrabold">{appointment.name}</span>
                  <span className="block truncate text-[11px] text-muted">
                    {appointment.service}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="hidden text-[11px] font-bold text-muted sm:block">
                    {appointment.staff}
                  </span>
                  <span
                    className={[
                      'status-pill',
                      statusTone[appointment.status] ?? 'bg-canvas text-muted',
                    ].join(' ')}
                  >
                    {appointment.status}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className="flex flex-col gap-5">
          <section className="panel p-5">
            <header className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-extrabold">Today&apos;s sales</h2>
              <span className="text-xs font-bold text-brand">View all</span>
            </header>
            <ul className="mt-4 flex flex-col divide-y divide-line">
              {sales.map((sale) => (
                <li key={sale.id} className="flex items-center gap-3 py-2.5 text-xs">
                  <span className="font-extrabold text-muted">{sale.id}</span>
                  <span className="min-w-0 flex-1 truncate font-bold">{sale.name}</span>
                  <span className="font-extrabold">{formatSgd(sale.amount)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel p-5">
            <h2 className="text-sm font-extrabold">Top selling today</h2>
            <ul className="mt-4 flex flex-col gap-2">
              {topItems.map((item, index) => (
                <li key={item.name} className="flex items-center gap-3 text-xs">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-canvas text-[10px] font-extrabold text-muted">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-bold">{item.name}</span>
                  <span className="text-muted">×{item.quantity}</span>
                  <span className="font-extrabold">{formatSgd(item.revenue)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <p className="text-[11px] text-muted">
        Figures shown are representative sample data from the design handoff. Live data arrives with
        the dashboard and sales modules.
      </p>
    </div>
  </>
);
