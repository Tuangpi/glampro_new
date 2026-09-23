import { useState } from 'react';
import type { FormEvent } from 'react';
import { staffTimeOffRequestSchema } from '@glampro/contracts';
import type { StaffProfileDetail } from '@glampro/contracts';
import { apiErrorMessage, createStaffTimeOff, removeStaffTimeOff } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import {
  Field,
  SectionCard,
  StatusMessage,
  inputClass,
  primaryButtonClass,
  subtleButtonClass,
} from '../shared/FormControls';

/** `datetime-local` has no time zone, so it is converted before it is sent. */
const toIsoOrNull = (value: string) => {
  const parsed = new Date(value);

  return value.trim() === '' || Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

/**
 * Dated absences layered on top of the recurring week: a single request creates
 * one window, and the entry can be removed again while it is still upcoming.
 */
export const StaffTimeOffSection = ({
  staffProfile,
  canManage,
  onChanged,
}: {
  staffProfile: StaffProfileDetail;
  canManage: boolean;
  onChanged: () => void;
}) => {
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const parsed = staffTimeOffRequestSchema.safeParse({
      startsAt: toIsoOrNull(startsAt),
      endsAt: toIsoOrNull(endsAt),
      reason: reason.trim() === '' ? null : reason.trim(),
    });

    if (!parsed.success) {
      setError('Give a start and an end, with the end after the start.');
      return;
    }

    setPending(true);

    try {
      await createStaffTimeOff(staffProfile.id, parsed.data);
      setStartsAt('');
      setEndsAt('');
      setReason('');
      onChanged();
    } catch (saveError) {
      setError(apiErrorMessage(saveError));
    } finally {
      setPending(false);
    }
  };

  const handleRemove = async (timeOffId: string) => {
    setError(null);
    setRemovingId(timeOffId);

    try {
      await removeStaffTimeOff(staffProfile.id, timeOffId);
      onChanged();
    } catch (removeError) {
      setError(apiErrorMessage(removeError));
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <SectionCard
      title="Time off"
      description="Absences on top of the weekly schedule. There is no approval step yet."
    >
      {canManage ? (
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleCreate} noValidate>
          <Field label="From">
            <input
              className={inputClass}
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
            />
          </Field>
          <Field label="Until">
            <input
              className={inputClass}
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </Field>
          <Field label="Reason" hint="Optional, for example annual leave.">
            <input
              className={inputClass}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={255}
            />
          </Field>
          <div className="flex items-end">
            <button type="submit" disabled={pending} className={primaryButtonClass}>
              {pending ? 'Recording…' : 'Record time off'}
            </button>
          </div>
        </form>
      ) : null}

      {staffProfile.timeOff.length === 0 ? (
        <p className="text-xs font-bold text-muted">No time off recorded.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {staffProfile.timeOff.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-3 py-2.5"
            >
              <span className="flex min-w-0 flex-col">
                <span className="text-xs font-extrabold">
                  {formatDateTime(entry.startsAt)} → {formatDateTime(entry.endsAt)}
                </span>
                <span className="text-[11px] font-bold text-muted">
                  {entry.reason ?? 'No reason recorded'}
                  {entry.createdBy
                    ? ` · recorded by ${entry.createdBy.firstName} ${entry.createdBy.lastName}`
                    : ''}
                </span>
              </span>
              {canManage ? (
                <button
                  type="button"
                  onClick={() => void handleRemove(entry.id)}
                  disabled={removingId === entry.id}
                  className={subtleButtonClass}
                >
                  {removingId === entry.id ? 'Removing…' : 'Remove'}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
    </SectionCard>
  );
};
