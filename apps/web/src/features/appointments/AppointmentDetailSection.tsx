import { useState } from 'react';
import type { AppointmentDetail, AppointmentStatus, AvailabilitySlot } from '@glampro/contracts';
import {
  apiErrorMessage,
  changeAppointmentStatus,
  fetchAvailability,
  updateAppointment,
} from '../../lib/api';
import { formatDateTimeInZone, formatSgd, formatTimeInZone, zonedDateOnly } from '../../lib/format';
import {
  Field,
  SectionCard,
  StatusMessage,
  inputClass,
  primaryButtonClass,
  subtleButtonClass,
} from '../shared/FormControls';
import {
  appointmentStatusActions,
  appointmentStatusLabels,
  appointmentStatusTone,
  customerNameOf,
  nextStatusesOf,
  staffNameOf,
} from './appointmentView';

/**
 * One visit: who it is for, what it costs, the moves the calendar allows, and
 * the trail of moves already made. A finished visit shows its history and its
 * notes, and offers nothing that would rewrite its time.
 */
export const AppointmentDetailSection = ({
  appointment,
  canManage,
  onChanged,
}: {
  appointment: AppointmentDetail;
  canManage: boolean;
  onChanged: () => void;
}) => {
  const timezone = appointment.location.timezone;

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [moving, setMoving] = useState(false);
  const [moveDate, setMoveDate] = useState(() =>
    zonedDateOnly(new Date(appointment.startsAt), timezone),
  );
  const [moveSlots, setMoveSlots] = useState<AvailabilitySlot[] | null>(null);
  const [noteDraft, setNoteDraft] = useState(appointment.notes ?? '');

  const nextStatuses = nextStatusesOf(appointment.status);
  const stepStatuses = nextStatuses.filter(
    (status) => status !== 'CANCELLED' && status !== 'NO_SHOW',
  );
  const closingStatuses = nextStatuses.filter(
    (status) => status === 'CANCELLED' || status === 'NO_SHOW',
  );

  const runStatus = async (status: AppointmentStatus, reason: string | null) => {
    setError(null);
    setBusy(status);

    try {
      await changeAppointmentStatus(appointment.id, { status, reason });
      setCancelling(false);
      setCancelReason('');
      onChanged();
    } catch (statusError) {
      setError(apiErrorMessage(statusError));
    } finally {
      setBusy(null);
    }
  };

  const loadMoveSlots = async () => {
    setError(null);
    setMoving(true);

    try {
      const data = await fetchAvailability({
        locationId: appointment.location.id,
        staffProfileId: appointment.staffProfileId,
        date: moveDate,
        serviceIds: appointment.services.map((service) => service.serviceId),
      });

      setMoveSlots(data.slots);
    } catch (loadError) {
      setMoveSlots([]);
      setError(apiErrorMessage(loadError));
    }
  };

  const moveTo = async (startsAt: string) => {
    setError(null);
    setBusy(startsAt);

    try {
      await updateAppointment(appointment.id, { startsAt });
      setMoveSlots(null);
      setMoving(false);
      onChanged();
    } catch (moveError) {
      setError(apiErrorMessage(moveError));
    } finally {
      setBusy(null);
    }
  };

  const saveNote = async () => {
    setError(null);
    setBusy('notes');

    try {
      await updateAppointment(appointment.id, {
        notes: noteDraft.trim() === '' ? null : noteDraft.trim(),
      });
      onChanged();
    } catch (noteError) {
      setError(apiErrorMessage(noteError));
    } finally {
      setBusy(null);
    }
  };

  return (
    <SectionCard
      title={customerNameOf(appointment.customer)}
      description={`${formatDateTimeInZone(appointment.startsAt, timezone)} → ${formatTimeInZone(
        appointment.endsAt,
        timezone,
      )} · ${appointment.durationMinutes} min`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${appointmentStatusTone(appointment.status)}`}
        >
          {appointmentStatusLabels[appointment.status]}
        </span>
        <span className="text-[11px] font-bold text-muted">
          {staffNameOf(appointment.staff)} · {appointment.location.name}
        </span>
        {appointment.cancellationReason === null ? null : (
          <span className="text-[11px] font-bold text-red-600">
            {appointment.cancellationReason}
          </span>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {appointment.services.map((service) => (
          <li
            key={service.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-3 py-2"
          >
            <span className="text-xs font-extrabold">{service.name}</span>
            <span className="text-[11px] font-bold text-muted">
              {service.durationMinutes} min · {formatSgd(service.priceInCents)}
            </span>
          </li>
        ))}
        <li className="flex items-center justify-between gap-3 px-3">
          <span className="text-xs font-extrabold">Total</span>
          <span className="text-xs font-extrabold">{formatSgd(appointment.priceInCents)}</span>
        </li>
      </ul>

      {canManage ? (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Notes">
            <input
              className={inputClass}
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              maxLength={1000}
            />
          </Field>
          <button
            type="button"
            className={subtleButtonClass}
            disabled={busy === 'notes'}
            onClick={() => void saveNote()}
          >
            {busy === 'notes' ? 'Saving…' : 'Save note'}
          </button>
        </div>
      ) : appointment.notes === null ? (
        <p className="text-xs font-bold text-muted">No notes on this visit.</p>
      ) : (
        <p className="text-xs font-bold text-[#2B3160]">{appointment.notes}</p>
      )}

      {canManage && nextStatuses.length > 0 ? (
        <div className="flex flex-col gap-3">
          <span className="text-xs font-extrabold text-[#2B3160]">Move the visit</span>

          <div className="flex flex-wrap gap-2">
            {stepStatuses.map((status) => (
              <button
                key={status}
                type="button"
                className={primaryButtonClass}
                disabled={busy === status}
                onClick={() => void runStatus(status, null)}
              >
                {busy === status ? 'Saving…' : appointmentStatusActions[status]}
              </button>
            ))}

            {closingStatuses.map((status) => (
              <button
                key={status}
                type="button"
                className={subtleButtonClass}
                disabled={busy === status}
                onClick={() =>
                  status === 'CANCELLED'
                    ? setCancelling(true)
                    : void runStatus(status, 'Client did not arrive')
                }
              >
                {busy === status ? 'Saving…' : appointmentStatusActions[status]}
              </button>
            ))}
          </div>

          {cancelling ? (
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Cancellation reason" hint="Optional, and kept in the status trail.">
                <input
                  className={inputClass}
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                  maxLength={255}
                />
              </Field>
              <button
                type="button"
                className={primaryButtonClass}
                disabled={busy === 'CANCELLED'}
                onClick={() => void runStatus('CANCELLED', cancelReason.trim() || null)}
              >
                {busy === 'CANCELLED' ? 'Cancelling…' : 'Cancel this visit'}
              </button>
            </div>
          ) : null}

          <div className="flex flex-wrap items-end gap-2">
            <button type="button" className={subtleButtonClass} onClick={() => setMoving(!moving)}>
              {moving ? 'Stop moving' : 'Move to another time'}
            </button>
          </div>

          {moving ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Day">
                  <input
                    className={inputClass}
                    type="date"
                    value={moveDate}
                    onChange={(event) => {
                      setMoveDate(event.target.value);
                      setMoveSlots(null);
                    }}
                  />
                </Field>
                <button
                  type="button"
                  className={subtleButtonClass}
                  onClick={() => void loadMoveSlots()}
                >
                  Show free times
                </button>
              </div>

              {moveSlots === null ? null : moveSlots.length === 0 ? (
                <p className="text-xs font-bold text-muted">Nothing free on that day.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {moveSlots.map((slot) => (
                    <button
                      key={slot.startsAt}
                      type="button"
                      className={subtleButtonClass}
                      disabled={busy === slot.startsAt}
                      onClick={() => void moveTo(slot.startsAt)}
                    >
                      {formatTimeInZone(slot.startsAt, timezone)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

      <div className="flex flex-col gap-2">
        <span className="text-xs font-extrabold text-[#2B3160]">Status trail</span>
        <ul className="flex flex-col gap-2">
          {appointment.statusHistory.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
              <span
                className={`rounded-full px-2 py-0.5 font-extrabold ${appointmentStatusTone(entry.toStatus)}`}
              >
                {appointmentStatusLabels[entry.toStatus]}
              </span>
              <span className="text-muted">
                {formatDateTimeInZone(entry.createdAt, timezone)}
                {entry.changedBy === null
                  ? ''
                  : ` · ${entry.changedBy.firstName} ${entry.changedBy.lastName}`}
              </span>
              {entry.reason === null ? null : (
                <span className="text-[#2B3160]">“{entry.reason}”</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </SectionCard>
  );
};
