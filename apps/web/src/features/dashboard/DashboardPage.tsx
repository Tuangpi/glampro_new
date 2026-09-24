import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { zonedDateOnly } from '../../lib/format';
import { useAuth } from '../auth/useAuth';
import { inputClass, subtleButtonClass } from '../shared/FormControls';
import { ManagerDashboard } from './ManagerDashboard';
import { OperationalHome } from './OperationalHome';

export const DashboardPage = () => {
  const { hasPermission, activeMembership, locations } = useAuth();
  const canViewReports = hasPermission('reports.view');
  const [locationId, setLocationId] = useState('');
  const [date, setDate] = useState('');
  const [reload, setReload] = useState(0);
  const activeLocation =
    locations.find((location) => location.id === locationId) ?? locations[0] ?? null;

  useEffect(() => {
    if (activeLocation && date === '') {
      setDate(zonedDateOnly(new Date(), activeLocation.timezone));
    }
  }, [activeLocation, date]);

  if (!activeLocation) {
    return (
      <>
        <PageHeader title="Dashboard" subtitle={activeMembership?.organization.name ?? 'GlamPro'} />
        <div className="p-5 sm:p-7">
          <section className="panel p-6">
            <p className="text-sm font-bold">No active location is available.</p>
            <p className="mt-2 text-xs text-muted">
              Add or reactivate a salon location before loading dashboard figures.
            </p>
          </section>
        </div>
      </>
    );
  }

  const effectiveDate = activeLocation
    ? date || zonedDateOnly(new Date(), activeLocation.timezone)
    : '';

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={
          canViewReports
            ? `${effectiveDate} · ${activeLocation.name}`
            : `Operational view · ${activeLocation.name}`
        }
        actions={
          hasPermission('sales.create') ? (
            <Link
              to="/sales"
              className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-extrabold text-white shadow-brand"
            >
              New sale <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : null
        }
      />
      <div className="flex flex-col gap-5 p-5 sm:p-7">
        <section className="panel flex flex-wrap items-end gap-3 p-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-extrabold text-[#2B3160]">Location</span>
            <select
              className={inputClass}
              value={activeLocation.id}
              onChange={(event) => {
                setLocationId(event.target.value);
                setDate('');
              }}
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-extrabold text-[#2B3160]">Day</span>
            <input
              className={inputClass}
              type="date"
              value={effectiveDate}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <button
            type="button"
            className={`${subtleButtonClass} flex items-center gap-2`}
            onClick={() => setReload((value) => value + 1)}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Refresh
          </button>
          <button
            type="button"
            className={subtleButtonClass}
            onClick={() => setDate(zonedDateOnly(new Date(), activeLocation.timezone))}
          >
            Today
          </button>
          <span className="ml-auto text-[11px] font-bold text-muted">
            {activeLocation.timezone} · {activeLocation.currency}
          </span>
        </section>

        {canViewReports ? (
          <ManagerDashboard
            key={`${activeLocation.id}:${effectiveDate}:${reload}`}
            locationId={activeLocation.id}
            date={effectiveDate}
            timezone={activeLocation.timezone}
          />
        ) : (
          <OperationalHome
            key={`${activeLocation.id}:${effectiveDate}:${reload}`}
            locationId={activeLocation.id}
            date={effectiveDate}
            timezone={activeLocation.timezone}
          />
        )}
      </div>
    </>
  );
};
