import { useState } from 'react';
import { staffScheduleRequestSchema } from '@glampro/contracts';
import type { StaffProfileDetail } from '@glampro/contracts';
import { apiErrorMessage, replaceStaffSchedule } from '../../lib/api';
import { SectionCard, StatusMessage, inputClass, primaryButtonClass } from '../shared/FormControls';

const dayLabels = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

type WeekRow = {
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
  isWorking: boolean;
};

/** A profile is created with seven rows, but a missing day still gets a row. */
const weekFrom = (staffProfile: StaffProfileDetail): WeekRow[] => {
  const byDay = new Map(staffProfile.schedule.map((entry) => [entry.dayOfWeek, entry]));

  return dayLabels.map((_, dayOfWeek) => {
    const entry = byDay.get(dayOfWeek);

    return {
      dayOfWeek,
      startsAt: entry?.startsAt ?? '09:00',
      endsAt: entry?.endsAt ?? '18:00',
      isWorking: entry?.isWorking ?? false,
    };
  });
};

/** A closed day sends no times, matching the contract. */
const scheduleInputFrom = (rows: WeekRow[]) => ({
  schedule: rows.map((row) => ({
    dayOfWeek: row.dayOfWeek,
    startsAt: row.isWorking ? row.startsAt : null,
    endsAt: row.isWorking ? row.endsAt : null,
    isWorking: row.isWorking,
  })),
});

/**
 * The recurring week, replaced whole. It is organization-level (not per
 * location), and sits underneath dated absences from the time-off tab.
 */
export const StaffScheduleSection = ({
  staffProfile,
  canManage,
  onChanged,
}: {
  staffProfile: StaffProfileDetail;
  canManage: boolean;
  onChanged: () => void;
}) => {
  const [rows, setRows] = useState<WeekRow[]>(() => weekFrom(staffProfile));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  const updateRow = (dayOfWeek: number, patch: Partial<WeekRow>) => {
    setSaved(false);
    setRows((current) =>
      current.map((row) => (row.dayOfWeek === dayOfWeek ? { ...row, ...patch } : row)),
    );
  };

  const handleSave = async () => {
    setError(null);
    setSaved(false);

    const parsed = staffScheduleRequestSchema.safeParse(scheduleInputFrom(rows));

    if (!parsed.success) {
      setError('Every working day needs a start time before its end time.');
      return;
    }

    setPending(true);

    try {
      await replaceStaffSchedule(staffProfile.id, parsed.data);
      setSaved(true);
      onChanged();
    } catch (saveError) {
      setError(apiErrorMessage(saveError));
    } finally {
      setPending(false);
    }
  };

  return (
    <SectionCard
      title="Weekly schedule"
      description="The recurring week. Untick a day the person never works."
    >
      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <div
            key={row.dayOfWeek}
            className="grid grid-cols-[minmax(84px,1fr)_auto_1fr_1fr] items-center gap-3 rounded-xl border border-line bg-white px-3 py-2"
          >
            <span className="text-xs font-extrabold">{dayLabels[row.dayOfWeek]}</span>
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-muted">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#6C5CE7]"
                checked={!row.isWorking}
                disabled={!canManage || pending}
                onChange={() => updateRow(row.dayOfWeek, { isWorking: !row.isWorking })}
              />
              Off
            </label>
            <input
              type="time"
              className={inputClass}
              value={row.isWorking ? row.startsAt : ''}
              disabled={!canManage || pending || !row.isWorking}
              onChange={(event) => updateRow(row.dayOfWeek, { startsAt: event.target.value })}
              aria-label={`${dayLabels[row.dayOfWeek]} start time`}
            />
            <input
              type="time"
              className={inputClass}
              value={row.isWorking ? row.endsAt : ''}
              disabled={!canManage || pending || !row.isWorking}
              onChange={(event) => updateRow(row.dayOfWeek, { endsAt: event.target.value })}
              aria-label={`${dayLabels[row.dayOfWeek]} end time`}
            />
          </div>
        ))}
      </div>

      {canManage ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={pending}
            className={primaryButtonClass}
          >
            {pending ? 'Saving…' : 'Save week'}
          </button>
          {saved ? <StatusMessage tone="success">Week saved.</StatusMessage> : null}
        </div>
      ) : null}

      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
    </SectionCard>
  );
};
