import { useState } from 'react';
import type { FormEvent } from 'react';
import { updateStaffProfileRequestSchema } from '@glampro/contracts';
import type { StaffProfileDetail, UpdateStaffProfileRequest } from '@glampro/contracts';
import { apiErrorMessage, updateStaffProfile } from '../../lib/api';
import {
  Field,
  SectionCard,
  StatusMessage,
  inputClass,
  primaryButtonClass,
} from '../shared/FormControls';

/** The colour falls back to the brand purple so the picker always has a value. */
const defaultColor = '#6144E4';

type StaffForm = {
  displayName: string;
  jobTitle: string;
  bio: string;
  color: string;
  isBookable: boolean;
  hireDate: string;
  endDate: string;
  isActive: boolean;
};

const staffFormFrom = (profile: StaffProfileDetail): StaffForm => ({
  displayName: profile.displayName ?? '',
  jobTitle: profile.jobTitle ?? '',
  bio: profile.bio ?? '',
  color: profile.color ?? defaultColor,
  isBookable: profile.isBookable,
  hireDate: profile.hireDate ?? '',
  endDate: profile.endDate ?? '',
  isActive: profile.isActive,
});

/** Empty strings clear the nullable columns; a date-only value stays as sent. */
const staffInputFrom = (form: StaffForm): UpdateStaffProfileRequest => ({
  displayName: form.displayName.trim() === '' ? null : form.displayName.trim(),
  jobTitle: form.jobTitle.trim() === '' ? null : form.jobTitle.trim(),
  bio: form.bio.trim() === '' ? null : form.bio.trim(),
  color: form.color,
  isBookable: form.isBookable,
  hireDate: form.hireDate.trim() === '' ? null : form.hireDate.trim(),
  endDate: form.endDate.trim() === '' ? null : form.endDate.trim(),
  isActive: form.isActive,
});

/**
 * The operational half of a staff profile. Identity (name, email, role) belongs
 * to the membership and is shown read-only, so the roster never disagrees with
 * Settings → Members.
 */
export const StaffProfileSection = ({
  staffProfile,
  canManage,
  onChanged,
}: {
  staffProfile: StaffProfileDetail;
  canManage: boolean;
  onChanged: () => void;
}) => {
  const [form, setForm] = useState(() => staffFormFrom(staffProfile));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  const updateField =
    <K extends keyof StaffForm>(key: K) =>
    (value: StaffForm[K]) =>
      setForm((current) => ({ ...current, [key]: value }));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSaved(false);

    const parsed = updateStaffProfileRequestSchema.safeParse(staffInputFrom(form));

    if (!parsed.success) {
      setError('Use a hex colour such as #6144E4, and keep the end date after the hire date.');
      return;
    }

    setPending(true);

    try {
      const { staffProfile: updated } = await updateStaffProfile(staffProfile.id, parsed.data);
      setForm(staffFormFrom({ ...staffProfile, ...updated }));
      setSaved(true);
      onChanged();
    } catch (saveError) {
      setError(apiErrorMessage(saveError));
    } finally {
      setPending(false);
    }
  };

  const memberName =
    staffProfile.displayName ?? `${staffProfile.member.firstName} ${staffProfile.member.lastName}`;

  return (
    <SectionCard
      title={memberName}
      description={`${staffProfile.member.email} · ${staffProfile.member.role.toLowerCase()} · membership ${staffProfile.member.status.toLowerCase()}`}
    >
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit} noValidate>
        <Field label="Display name" hint="Shown on the calendar and the roster.">
          <input
            className={inputClass}
            value={form.displayName}
            disabled={!canManage}
            onChange={(event) => updateField('displayName')(event.target.value)}
            maxLength={160}
          />
        </Field>
        <Field label="Job title">
          <input
            className={inputClass}
            value={form.jobTitle}
            disabled={!canManage}
            onChange={(event) => updateField('jobTitle')(event.target.value)}
            maxLength={120}
          />
        </Field>
        <Field label="Calendar colour">
          <input
            className={`${inputClass} h-11 p-1`}
            type="color"
            value={form.color}
            disabled={!canManage}
            onChange={(event) => updateField('color')(event.target.value.toUpperCase())}
          />
        </Field>
        <Field label="Hire date">
          <input
            className={inputClass}
            type="date"
            value={form.hireDate}
            disabled={!canManage}
            onChange={(event) => updateField('hireDate')(event.target.value)}
          />
        </Field>
        <Field label="End date" hint="Leave empty while the person is still with the salon.">
          <input
            className={inputClass}
            type="date"
            value={form.endDate}
            disabled={!canManage}
            onChange={(event) => updateField('endDate')(event.target.value)}
          />
        </Field>
        <Field label="Notes for the team">
          <input
            className={inputClass}
            value={form.bio}
            disabled={!canManage}
            onChange={(event) => updateField('bio')(event.target.value)}
            maxLength={500}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
          <label className="flex items-center gap-2 text-xs font-bold text-[#2B3160]">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#6C5CE7]"
              checked={form.isBookable}
              disabled={!canManage}
              onChange={(event) => updateField('isBookable')(event.target.checked)}
            />
            Bookable
          </label>
          <label className="flex items-center gap-2 text-xs font-bold text-[#2B3160]">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#6C5CE7]"
              checked={form.isActive}
              disabled={!canManage}
              onChange={(event) => updateField('isActive')(event.target.checked)}
            />
            On the roster
          </label>
        </div>

        {canManage ? (
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button type="submit" disabled={pending} className={primaryButtonClass}>
              {pending ? 'Saving…' : 'Save profile'}
            </button>
            {saved ? <StatusMessage tone="success">Profile saved.</StatusMessage> : null}
          </div>
        ) : null}

        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      </form>
    </SectionCard>
  );
};
