import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type {
  AppointmentReportData,
  PaymentReportData,
  ReportQuery,
  RevenueReportData,
  StaffReportData,
} from '@glampro/contracts';
import { PageHeader } from '../../components/layout/PageHeader';
import {
  apiErrorMessage,
  fetchAppointmentReport,
  fetchPaymentReport,
  fetchRevenueReport,
  fetchStaffReport,
} from '../../lib/api';
import { zonedDateOnly } from '../../lib/format';
import { useAuth } from '../auth/useAuth';
import {
  Field,
  PermissionNotice,
  StatusMessage,
  inputClass,
  subtleButtonClass,
} from '../shared/FormControls';
import { AppointmentSection, PaymentSection, RevenueSection, StaffSection } from './ReportSections';
import {
  rangeForPreset,
  reportPresets,
  reportTabLabels,
  reportTabs,
  type ReportPreset,
  type ReportTab,
} from './reportView';

type ReportState =
  | { tab: 'revenue'; data: RevenueReportData }
  | { tab: 'appointments'; data: AppointmentReportData }
  | { tab: 'payments'; data: PaymentReportData }
  | { tab: 'staff'; data: StaffReportData };

const ReportContent = ({ state }: { state: ReportState }) => {
  if (state.tab === 'revenue') return <RevenueSection report={state.data} />;
  if (state.tab === 'appointments') return <AppointmentSection report={state.data} />;
  if (state.tab === 'payments') return <PaymentSection report={state.data} />;
  return <StaffSection report={state.data} />;
};

export const ReportsPage = () => {
  const { hasPermission, activeMembership, locations } = useAuth();
  const allowed = hasPermission('reports.view');
  const [locationId, setLocationId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [tab, setTab] = useState<ReportTab>('revenue');
  const [state, setState] = useState<ReportState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const activeLocation =
    locations.find((location) => location.id === locationId) ?? locations[0] ?? null;

  const applyPreset = useCallback((days: ReportPreset, timezone: string) => {
    const range = rangeForPreset(days, zonedDateOnly(new Date(), timezone));
    setFrom(range.from);
    setTo(range.to);
  }, []);

  useEffect(() => {
    if (activeLocation && from === '') applyPreset(30, activeLocation.timezone);
  }, [activeLocation, applyPreset, from]);

  useEffect(() => {
    if (!allowed || !activeLocation || from === '' || to === '') return;
    let active = true;
    const query: ReportQuery = { locationId: activeLocation.id, from, to };
    setState(null);
    setLoading(true);
    setError(null);

    const load = async (): Promise<ReportState> => {
      if (tab === 'revenue') {
        return { tab, data: await fetchRevenueReport(query) };
      }
      if (tab === 'appointments') {
        return { tab, data: await fetchAppointmentReport(query) };
      }
      if (tab === 'payments') {
        return { tab, data: await fetchPaymentReport(query) };
      }
      return { tab, data: await fetchStaffReport(query) };
    };

    load()
      .then((result) => {
        if (active) setState(result);
      })
      .catch((loadError: unknown) => {
        if (active) setError(apiErrorMessage(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeLocation, allowed, from, reload, tab, to]);

  if (!allowed) {
    return (
      <>
        <PageHeader title="Reports" subtitle={activeMembership?.organization.name ?? 'GlamPro'} />
        <div className="p-5 sm:p-7">
          <PermissionNotice permission="reports.view" />
        </div>
      </>
    );
  }

  if (!activeLocation) {
    return (
      <>
        <PageHeader title="Reports" subtitle={activeMembership?.organization.name ?? 'GlamPro'} />
        <div className="p-5 sm:p-7">
          <section className="panel p-6">
            <p className="text-sm font-bold">No active location is available.</p>
            <p className="mt-2 text-xs text-muted">
              Reports are location-scoped so their calendar days and currencies remain unambiguous.
            </p>
          </section>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={`${activeLocation.name} · ${activeLocation.timezone}`}
      />
      <div className="flex flex-col gap-5 p-5 sm:p-7">
        <section className="panel flex flex-wrap items-end gap-3 p-5">
          <Field label="Location">
            <select
              className={inputClass}
              value={activeLocation.id}
              onChange={(event) => {
                setLocationId(event.target.value);
                setFrom('');
              }}
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="From">
            <input
              className={inputClass}
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </Field>
          <Field label="To">
            <input
              className={inputClass}
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            {reportPresets.map((days) => (
              <button
                key={days}
                type="button"
                className={subtleButtonClass}
                onClick={() => applyPreset(days, activeLocation.timezone)}
              >
                {days === 0 ? 'Today' : `${days} days`}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`${subtleButtonClass} ml-auto flex items-center gap-2`}
            onClick={() => setReload((value) => value + 1)}
            disabled={loading}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Refresh
          </button>
        </section>

        <nav className="flex flex-wrap gap-2" aria-label="Report sections">
          {reportTabs.map((entry) => (
            <button
              key={entry}
              type="button"
              className={[
                'rounded-xl px-4 py-2.5 text-xs font-extrabold transition-colors',
                tab === entry
                  ? 'bg-brand text-white shadow-brand'
                  : 'border border-line bg-white text-[#2B3160] hover:bg-canvas',
              ].join(' ')}
              onClick={() => {
                setTab(entry);
                setState(null);
              }}
            >
              {reportTabLabels[entry]}
            </button>
          ))}
        </nav>

        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
        {loading ? (
          <p className="text-xs font-bold text-muted">
            Loading {reportTabLabels[tab].toLowerCase()} report…
          </p>
        ) : state ? (
          <ReportContent state={state} />
        ) : !error ? (
          <p className="text-xs font-bold text-muted">Choose a period to load this report.</p>
        ) : null}
      </div>
    </>
  );
};
