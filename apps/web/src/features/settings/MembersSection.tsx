import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { inviteMemberRequestSchema, membershipRoles } from '@glampro/contracts';
import type {
  InvitationSummary,
  MemberStatusAction,
  MemberSummary,
  MembershipRole,
} from '@glampro/contracts';
import {
  apiErrorMessage,
  changeMemberRole,
  changeMemberStatus,
  createInvitation,
  fetchInvitations,
  fetchMembers,
  revokeInvitation,
} from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAuth } from '../auth/useAuth';
import {
  Field,
  PermissionNotice,
  SectionCard,
  StatusMessage,
  inputClass,
  primaryButtonClass,
  subtleButtonClass,
} from './SettingsCommon';

const roleLabels: Record<MembershipRole, string> = {
  ORG_OWNER: 'Owner',
  ORG_ADMIN: 'Administrator',
  MANAGER: 'Manager',
  RECEPTIONIST: 'Receptionist',
  STAFF: 'Staff',
};

const statusLabels: Record<string, string> = {
  INVITED: 'Invited',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  REMOVED: 'Removed',
};

const statusTone: Record<string, string> = {
  INVITED: 'bg-[#F1ECFF] text-brand',
  ACTIVE: 'bg-[#E9F7F0] text-[#1C8A5A]',
  SUSPENDED: 'bg-[#FFF4DE] text-[#B26B00]',
  REMOVED: 'bg-[#FDECEC] text-[#C0392B]',
};

const invitationTone: Record<string, string> = {
  PENDING: 'bg-[#FFF4DE] text-[#B26B00]',
  ACCEPTED: 'bg-[#E9F7F0] text-[#1C8A5A]',
  REVOKED: 'bg-canvas text-muted',
  EXPIRED: 'bg-[#FDECEC] text-[#C0392B]',
};

const statusConfirmations = (member: MemberSummary): Record<MemberStatusAction, string> => ({
  ACTIVE: `Reactivate ${member.user.firstName}?`,
  SUSPENDED: `Suspend ${member.user.firstName}? They lose access immediately.`,
  REMOVED: `Remove ${member.user.firstName} from the organization?`,
});

export const MembersSection = () => {
  const { hasPermission } = useAuth();
  const allowed = hasPermission('members.manage');

  const [members, setMembers] = useState<MemberSummary[] | null>(null);
  const [invitations, setInvitations] = useState<InvitationSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviteForm, setInviteForm] = useState<{ email: string; role: MembershipRole }>({
    email: '',
    role: 'STAFF',
  });
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([fetchMembers(), fetchInvitations()])
      .then(([memberData, invitationData]) => {
        setMembers(memberData.members);
        setInvitations(invitationData.invitations);
      })
      .catch((loadError: unknown) => setError(apiErrorMessage(loadError)));
  }, []);

  useEffect(() => {
    if (allowed) {
      load();
    }
  }, [allowed, load]);

  if (!allowed) {
    return <PermissionNotice permission="members.manage" />;
  }

  if (!members) {
    return (
      <SectionCard title="Members" description="Loading members…">
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      </SectionCard>
    );
  }

  const replaceMember = (member: MemberSummary) =>
    setMembers((current) =>
      current ? current.map((entry) => (entry.id === member.id ? member : entry)) : current,
    );

  const handleRoleChange = async (member: MemberSummary, role: MembershipRole) => {
    setError(null);
    setNotice(null);
    setBusyId(member.id);

    try {
      const { member: updated } = await changeMemberRole(member.id, { role });
      replaceMember(updated);
      setNotice(`${updated.user.firstName} is now ${roleLabels[role]}.`);
    } catch (changeError) {
      setError(apiErrorMessage(changeError));
      load();
    } finally {
      setBusyId(null);
    }
  };

  const handleStatusChange = async (member: MemberSummary, status: MemberStatusAction) => {
    if (!window.confirm(statusConfirmations(member)[status])) {
      return;
    }

    setError(null);
    setNotice(null);
    setBusyId(member.id);

    try {
      const { member: updated } = await changeMemberStatus(member.id, { status });
      replaceMember(updated);
      setNotice(
        `${updated.user.firstName} is now ${statusLabels[updated.status]?.toLowerCase() ?? updated.status}.`,
      );
    } catch (changeError) {
      setError(apiErrorMessage(changeError));
      load();
    } finally {
      setBusyId(null);
    }
  };

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const parsed = inviteMemberRequestSchema.safeParse(inviteForm);

    if (!parsed.success) {
      setError('Enter a valid email address and choose a role.');
      return;
    }

    setInviting(true);

    try {
      const { invitation } = await createInvitation(parsed.data);
      setInviteForm({ email: '', role: 'STAFF' });
      setNotice(`Invitation sent to ${invitation.email}.`);
      load();
    } catch (inviteError) {
      setError(apiErrorMessage(inviteError));
    } finally {
      setInviting(false);
    }
  };

  const handleRevoke = async (invitation: InvitationSummary) => {
    if (!window.confirm(`Revoke the invitation for ${invitation.email}?`)) {
      return;
    }

    setError(null);
    setNotice(null);

    try {
      await revokeInvitation(invitation.id);
      setNotice('Invitation revoked.');
      load();
    } catch (revokeError) {
      setError(apiErrorMessage(revokeError));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {error || notice ? (
        <div className="flex flex-wrap gap-4">
          {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
          {notice ? <StatusMessage tone="success">{notice}</StatusMessage> : null}
        </div>
      ) : null}

      <SectionCard
        title="Members"
        description="People with access to this organization. You cannot change your own membership, and the organization must keep at least one active owner."
      >
        <ul className="flex flex-col divide-y divide-line">
          {members.map((member) => {
            const initials =
              `${member.user.firstName.charAt(0)}${member.user.lastName.charAt(0)}`.toUpperCase();

            return (
              <li key={member.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-extrabold text-white">
                  {initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-extrabold">
                    {member.user.firstName} {member.user.lastName}
                    {member.isSelf ? ' (you)' : ''}
                  </span>
                  <span className="block truncate text-[11px] text-muted">{member.user.email}</span>
                </span>
                <span
                  className={[
                    'status-pill',
                    statusTone[member.status] ?? 'bg-canvas text-muted',
                  ].join(' ')}
                >
                  {statusLabels[member.status] ?? member.status}
                </span>
                <select
                  className={`${inputClass} w-36`}
                  value={member.role}
                  disabled={member.isSelf || busyId === member.id}
                  onChange={(event) =>
                    void handleRoleChange(member, event.target.value as MembershipRole)
                  }
                  aria-label={`Role for ${member.user.firstName}`}
                >
                  {membershipRoles.map((role) => (
                    <option key={role} value={role}>
                      {roleLabels[role]}
                    </option>
                  ))}
                </select>
                {member.isSelf ? null : (
                  <span className="flex gap-2">
                    {member.status === 'ACTIVE' ? (
                      <button
                        type="button"
                        className={subtleButtonClass}
                        disabled={busyId === member.id}
                        onClick={() => void handleStatusChange(member, 'SUSPENDED')}
                      >
                        Suspend
                      </button>
                    ) : null}
                    {member.status !== 'ACTIVE' ? (
                      <button
                        type="button"
                        className={subtleButtonClass}
                        disabled={busyId === member.id}
                        onClick={() => void handleStatusChange(member, 'ACTIVE')}
                      >
                        Reactivate
                      </button>
                    ) : null}
                    {member.status !== 'REMOVED' ? (
                      <button
                        type="button"
                        className={`${subtleButtonClass} text-red-600`}
                        disabled={busyId === member.id}
                        onClick={() => void handleStatusChange(member, 'REMOVED')}
                      >
                        Remove
                      </button>
                    ) : null}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </SectionCard>

      <SectionCard
        title="Invite someone"
        description="They receive a single-use link by email; the invitation expires after seven days."
      >
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => void handleInvite(event)}
          noValidate
        >
          <Field label="Email">
            <input
              className={inputClass}
              type="email"
              value={inviteForm.email}
              onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })}
              placeholder="staff@salon.com"
              maxLength={254}
            />
          </Field>
          <Field label="Role">
            <select
              className={`${inputClass} w-40`}
              value={inviteForm.role}
              onChange={(event) =>
                setInviteForm({ ...inviteForm, role: event.target.value as MembershipRole })
              }
              aria-label="Role for the invitation"
            >
              {membershipRoles.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </select>
          </Field>
          <button type="submit" disabled={inviting} className={primaryButtonClass}>
            {inviting ? 'Sending…' : 'Send invitation'}
          </button>
        </form>

        {invitations.length > 0 ? (
          <ul className="flex flex-col divide-y divide-line">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-wrap items-center gap-3 py-2.5 text-xs">
                <span className="min-w-0 flex-1 truncate font-bold">{invitation.email}</span>
                <span className="text-muted">{roleLabels[invitation.role]}</span>
                <span
                  className={[
                    'status-pill',
                    invitationTone[invitation.status] ?? 'bg-canvas text-muted',
                  ].join(' ')}
                >
                  {invitation.status}
                </span>
                <span className="text-muted">expires {formatDate(invitation.expiresAt)}</span>
                {invitation.status === 'PENDING' ? (
                  <button
                    type="button"
                    className={`${subtleButtonClass} text-red-600`}
                    onClick={() => void handleRevoke(invitation)}
                  >
                    Revoke
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs font-bold text-muted">No invitations yet.</p>
        )}
      </SectionCard>
    </div>
  );
};
