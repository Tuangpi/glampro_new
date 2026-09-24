import type { AppointmentSummary } from '@glampro/contracts';
import { formatSgd, formatTimeInZone } from '../../lib/format';
import { SectionCard } from '../shared/FormControls';
import {
  appointmentStatusLabels,
  appointmentStatusTone,
  columnsOf,
  customerNameOf,
} from './appointmentView';

/**
 * The day's visits, one column per stylist. The front desk reads a chair top to
 * bottom and the salon left to right, and selecting a visit opens its detail
 * beside the grid.
 */
export const AppointmentDayGrid = ({
  appointments,
  timezone,
  selectedId,
  onSelect,
}: {
  appointments: AppointmentSummary[] | null;
  timezone: string;
  selectedId: string | null;
  onSelect: (appointmentId: string) => void;
}) => {
  const description = 'One column per stylist for the day you pick.';

  if (appointments === null) {
    return (
      <SectionCard title="Day view" description={description}>
        <p className="text-xs font-bold text-muted">Loading the diary…</p>
      </SectionCard>
    );
  }

  const columns = columnsOf(appointments);

  if (columns.length === 0) {
    return (
      <SectionCard title="Day view" description={description}>
        <p className="text-xs font-bold text-muted">
          Nothing is booked for this day. Book a visit from the panel beside the diary.
        </p>
      </SectionCard>
    );
  }

  return (
    <section className="panel flex flex-col gap-4 p-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-sm font-extrabold">Day view</h2>
        <p className="text-xs leading-relaxed text-muted">
          {appointments.length} {appointments.length === 1 ? 'visit' : 'visits'} across{' '}
          {columns.length} {columns.length === 1 ? 'stylist' : 'stylists'}.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {columns.map((column) => (
          <div
            key={column.id}
            className="flex flex-col gap-3 rounded-xl border border-line bg-canvas/60 p-3"
          >
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full bg-brand"
                style={column.color === null ? undefined : { backgroundColor: column.color }}
                aria-hidden
              />
              <h3 className="text-xs font-extrabold">{column.name}</h3>
              <span className="text-[11px] font-bold text-muted">
                {column.visits.length} booked
              </span>
            </div>

            <ul className="flex flex-col gap-2">
              {column.visits.map((appointment) => (
                <li key={appointment.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(appointment.id)}
                    aria-current={selectedId === appointment.id ? 'true' : undefined}
                    className={[
                      'flex w-full flex-col gap-1 rounded-xl border bg-white px-3 py-2.5 text-left transition-colors',
                      selectedId === appointment.id
                        ? 'border-brand shadow-brand'
                        : 'border-line hover:bg-canvas',
                    ].join(' ')}
                  >
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-extrabold">
                        {formatTimeInZone(appointment.startsAt, timezone)} →{' '}
                        {formatTimeInZone(appointment.endsAt, timezone)}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${appointmentStatusTone(appointment.status)}`}
                      >
                        {appointmentStatusLabels[appointment.status]}
                      </span>
                    </span>
                    <span className="text-xs font-bold">
                      {customerNameOf(appointment.customer)}
                    </span>
                    <span className="text-[11px] font-medium text-muted">
                      {appointment.services.map((service) => service.name).join(' + ') ||
                        'No services'}{' '}
                      · {formatSgd(appointment.priceInCents)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
};
