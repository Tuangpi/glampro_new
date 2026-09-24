import { useCallback, useEffect, useState } from 'react';
import type {
  AppointmentDetail,
  AppointmentSummary,
  StaffProfileSummary,
} from '@glampro/contracts';
import { PageHeader } from '../../components/layout/PageHeader';
import {
  apiErrorMessage,
  fetchAppointment,
  fetchAppointments,
  fetchStaffProfiles,
} from '../../lib/api';
import { addDaysToDateOnly, dayLabel, zonedDateOnly } from '../../lib/format';
import { useAuth } from '../auth/useAuth';
import {
  Field,
  PermissionNotice,
  SectionCard,
  StatusMessage,
  inputClass,
  primaryButtonClass,
  subtleButtonClass,
} from '../shared/FormControls';
import { AppointmentBookingForm } from './AppointmentBookingForm';
import { AppointmentDayGrid } from './AppointmentDayGrid';
import { AppointmentDetailSection } from './AppointmentDetailSection';

/**
 * Appointments: the day's diary beside the booking form and the selected visit.
 * The day is read in the location's zone, so the calendar follows the salon's
 * hours rather than whatever zone the browser is in.
 */
export const AppointmentsPage = () => {
  const { hasPermission, activeMembership, locations } = useAuth();
  const canRead = hasPermission('appointments.read');
  const canManage = hasPermission('appointments.manage');

  const [locationId, setLocationId] = useState('');
  const [date, setDate] = useState('');
  const [appointments, setAppointments] = useState<AppointmentSummary[] | null>(null);
  const [staffProfiles, setStaffProfiles] = useState<StaffProfileSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AppointmentDetail | null>(null);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeLocation = locations.find((entry) => entry.id === locationId) ?? locations[0] ?? null;
  const timezone = activeLocation?.timezone ?? 'Asia/Singapore';

  const loadDay = useCallback((targetLocationId: string, targetDate: string) => {
    setError(null);

    fetchAppointments({ date: targetDate, locationId: targetLocationId })
      .then((data) => setAppointments(data.appointments))
      .catch((loadError: unknown) => setError(apiErrorMessage(loadError)));
  }, []);

  const loadDetail = useCallback((appointmentId: string | null) => {
    if (appointmentId === null) {
      setDetail(null);
      return;
    }

    fetchAppointment(appointmentId)
      .then((data) => setDetail(data.appointment))
      .catch((loadError: unknown) => setError(apiErrorMessage(loadError)));
  }, []);

  // The day view opens on the location's today, in the location's zone.
  useEffect(() => {
    if (activeLocation !== null && date === '') {
      setDate(zonedDateOnly(new Date(), activeLocation.timezone));
      setLocationId((current) => (current === '' ? activeLocation.id : current));
    }
  }, [activeLocation, date]);

  useEffect(() => {
    if (canRead && locationId !== '' && date !== '') {
      loadDay(locationId, date);
    }
  }, [canRead, date, loadDay, locationId]);

  useEffect(() => {
    if (canRead) {
      loadDetail(selectedId);
    }
  }, [canRead, loadDetail, selectedId]);

  useEffect(() => {
    if (!canRead) {
      return;
    }

    fetchStaffProfiles({ isActive: true })
      .then((data) => setStaffProfiles(data.staffProfiles.filter((staff) => staff.isBookable)))
      .catch((loadError: unknown) => setError(apiErrorMessage(loadError)));
  }, [canRead]);

  if (!canRead) {
    return <PermissionNotice permission="appointments.read" />;
  }

  const refresh = () => {
    if (locationId !== '' && date !== '') {
      loadDay(locationId, date);
    }

    loadDetail(selectedId);
  };

  const stepDay = (days: number) => {
    if (date !== '') {
      setDate(addDaysToDateOnly(date, days));
    }
  };

  const openBooking = () => {
    setSelectedId(null);
    setDetail(null);
    setBooking(true);
  };

  return (
    <>
      <PageHeader
        title="Appointments"
        subtitle={activeMembership?.organization.name ?? 'GlamPro'}
      />
      <div className="flex flex-col gap-5 p-5 sm:p-7">
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

        <section className="panel flex flex-wrap items-end gap-3 p-6">
          <Field label="Location">
            <select
              className={inputClass}
              value={activeLocation?.id ?? ''}
              onChange={(event) => setLocationId(event.target.value)}
            >
              {locations.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Day" hint={`${dayLabel(date)} · ${timezone}`}>
            <input
              className={inputClass}
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>

          <div className="flex items-center gap-2">
            <button type="button" className={subtleButtonClass} onClick={() => stepDay(-1)}>
              ‹ Previous
            </button>
            <button
              type="button"
              className={subtleButtonClass}
              onClick={() => {
                if (activeLocation !== null) {
                  setDate(zonedDateOnly(new Date(), activeLocation.timezone));
                }
              }}
            >
              Today
            </button>
            <button type="button" className={subtleButtonClass} onClick={() => stepDay(1)}>
              Next ›
            </button>
          </div>

          {canManage && activeLocation !== null ? (
            <button type="button" className={primaryButtonClass} onClick={openBooking}>
              New visit
            </button>
          ) : null}
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          {activeLocation === null ? (
            <SectionCard
              title="No active location"
              description="A location carries the time zone the calendar reads the day in."
            >
              <p className="text-xs font-bold text-muted">
                Add or reactivate a location in Settings before booking visits.
              </p>
            </SectionCard>
          ) : (
            <AppointmentDayGrid
              appointments={appointments}
              timezone={timezone}
              selectedId={selectedId}
              onSelect={(appointmentId) => {
                setBooking(false);
                setSelectedId(appointmentId);
              }}
            />
          )}

          <div className="flex flex-col gap-5">
            {booking && canManage && activeLocation !== null && date !== '' ? (
              <AppointmentBookingForm
                key={`${activeLocation.id}-${date}`}
                locationId={activeLocation.id}
                timezone={timezone}
                date={date}
                staffProfiles={staffProfiles}
                onBooked={() => {
                  setBooking(false);
                  refresh();
                }}
                onClose={() => setBooking(false)}
              />
            ) : null}

            {detail !== null && !booking ? (
              <AppointmentDetailSection
                key={detail.id}
                appointment={detail}
                canManage={canManage}
                onChanged={refresh}
              />
            ) : null}

            {detail === null && !booking ? (
              <SectionCard
                title="Visit detail"
                description="Pick a visit in the diary, or book a new one."
              >
                <p className="text-xs font-bold text-muted">Nothing selected.</p>
              </SectionCard>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
};
