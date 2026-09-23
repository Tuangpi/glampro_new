import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { createStaffProfileRequestSchema } from '@glampro/contracts';
import type { StaffCandidate, StaffProfileSummary } from '@glampro/contracts';
import { apiErrorMessage, createStaffProfile, fetchStaffCandidates } from '../../lib/api';
import {
  Field,
  SectionCard,
  StatusMessage,
  inputClass,
  primaryButtonClass,
} from '../shared/FormControls';

const memberNameOf = (profile: StaffProfileSummary) =>
  profile.displayName ?? `${profile.member.firstName} ${profile.member.lastName}`;

const candidateNameOf = (candidate: StaffCandidate) =>
  `${candidate.firstName} ${candidate.lastName}`;

/**
 * The roster: everyone who has a staff profile, plus the create form. A profile
 * is attached to an existing active membership, so the form picks a person
 * rather than asking for a name and email a second time.
 */
export const StaffRosterSection = ({
  staffProfiles,
  selectedId,
  canManage,
  onSelect,
  onCreated,
}: {
  staffProfiles: StaffProfileSummary[] | null;
  selectedId: string | null;
  canManage: boolean;
  onSelect: (staffProfileId: string) => void;
  onCreated: (staffProfileId: string) => void;
}) => {
  const [candidates, setCandidates] = useState<StaffCandidate[] | null>(null);
  const [membershipId, setMembershipId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const loadCandidates = useCallback(() => {
    fetchStaffCandidates()
      .then((data) => {
        setCandidates(data.candidates);
        setMembershipId((current) =>
          current === '' ? (data.candidates[0]?.membershipId ?? '') : current,
        );
      })
      .catch((loadError: unknown) => setError(apiErrorMessage(loadError)));
  }, []);

  /** `GET /staff/candidates` needs `staff.manage`, so only ask when we hold it. */
  useEffect(() => {
    if (canManage) {
      loadCandidates();
    }
  }, [canManage, loadCandidates]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const parsed = createStaffProfileRequestSchema.safeParse({
      membershipId,
      displayName: displayName.trim() === '' ? null : displayName.trim(),
      jobTitle: jobTitle.trim() === '' ? null : jobTitle.trim(),
    });

    if (!parsed.success) {
      setError('Pick a member from the list, and check the hire and end dates.');
      return;
    }

    setCreating(true);

    try {
      const { staffProfile } = await createStaffProfile(parsed.data);
      setDisplayName('');
      setJobTitle('');
      loadCandidates();
      onCreated(staffProfile.id);
    } catch (createError) {
      setError(apiErrorMessage(createError));
    } finally {
      setCreating(false);
    }
  };

  const hasCandidates = candidates !== null && candidates.length > 0;

  return (
    <div className="flex flex-col gap-5">
      {canManage ? (
        <SectionCard
          title="Add to the roster"
          description="Pick a teammate who is already an active member. A full week of non-working days is created with the profile."
        >
          <form className="flex flex-col gap-3" onSubmit={handleCreate} noValidate>
            <Field label="Member">
              <select
                className={inputClass}
                value={membershipId}
                disabled={!hasCandidates}
                onChange={(event) => setMembershipId(event.target.value)}
              >
                {hasCandidates ? null : (
                  <option value="">
                    {candidates === null
                      ? 'Loading members…'
                      : 'Every active member already has a profile'}
                  </option>
                )}
                {(candidates ?? []).map((candidate) => (
                  <option key={candidate.membershipId} value={candidate.membershipId}>
                    {candidateNameOf(candidate)} — {candidate.role.toLowerCase()}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Display name" hint="Optional. Falls back to the member's own name.">
              <input
                className={inputClass}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={160}
              />
            </Field>
            <Field label="Job title">
              <input
                className={inputClass}
                value={jobTitle}
                onChange={(event) => setJobTitle(event.target.value)}
                placeholder="Senior stylist"
                maxLength={120}
              />
            </Field>
            <div>
              <button
                type="submit"
                disabled={creating || !hasCandidates}
                className={primaryButtonClass}
              >
                {creating ? 'Creating…' : 'Create profile'}
              </button>
            </div>
            {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
          </form>
        </SectionCard>
      ) : null}
      <SectionCard title="Roster" description="Everyone who can be booked or assigned a service.">
        {staffProfiles === null ? (
          <p className="text-xs font-bold text-muted">Loading the roster…</p>
        ) : staffProfiles.length === 0 ? (
          <p className="text-xs font-bold text-muted">Nobody on the roster yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {staffProfiles.map((profile) => (
              <li key={profile.id}>
                <button
                  type="button"
                  onClick={() => onSelect(profile.id)}
                  aria-current={profile.id === selectedId ? 'true' : undefined}
                  className={[
                    'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                    profile.id === selectedId
                      ? 'border-brand bg-[#F7F4FF]'
                      : 'border-line bg-white hover:bg-canvas',
                  ].join(' ')}
                >
                  <span
                    className="h-7 w-7 shrink-0 rounded-full border border-line"
                    style={{ backgroundColor: profile.color ?? '#E7E4F5' }}
                    aria-hidden
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-xs font-extrabold">{memberNameOf(profile)}</span>
                    <span className="truncate text-[11px] font-bold text-muted">
                      {profile.jobTitle ?? profile.member.role.toLowerCase()}
                      {profile.isBookable ? ' · bookable' : ' · not bookable'}
                      {profile.isActive ? '' : ' · inactive'}
                      {profile.member.status === 'ACTIVE'
                        ? ''
                        : ` · member ${profile.member.status.toLowerCase()}`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
};
