import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { MembershipRole, MembershipSummary } from '@glampro/contracts';
import { acceptInvitation, apiErrorMessage } from '../../lib/api';
import { useAuth } from '../auth/useAuth';
import { StatusMessage, primaryButtonClass, subtleButtonClass } from './SettingsCommon';

const roleLabels: Record<MembershipRole, string> = {
  ORG_OWNER: 'Owner',
  ORG_ADMIN: 'Administrator',
  MANAGER: 'Manager',
  RECEPTIONIST: 'Receptionist',
  STAFF: 'Staff',
};

/**
 * Lands from the invitation email. It runs inside `RequireAuth` but outside the
 * app shell, so an unauthenticated visitor is redirected to login and returns
 * here with the token intact.
 */
export const InviteAcceptPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { user, reloadSession } = useAuth();
  const navigate = useNavigate();

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<MembershipSummary | null>(null);

  const handleAccept = async () => {
    if (!token) {
      return;
    }

    setError(null);
    setPending(true);

    try {
      const { membership } = await acceptInvitation({ token });
      setJoined(membership);
      // Pick up the new membership so navigation reflects the joined organization.
      await reloadSession();
    } catch (acceptError) {
      setError(apiErrorMessage(acceptError));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10">
      <section className="panel flex w-full max-w-md flex-col gap-4 p-7">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-[#8B6BFF] text-lg font-extrabold text-white">
          G
        </span>

        {joined ? (
          <>
            <h1 className="text-lg font-extrabold">You joined {joined.organization.name}</h1>
            <p className="text-sm leading-relaxed text-muted">
              This account is now a <span className="font-bold">{roleLabels[joined.role]}</span> of{' '}
              {joined.organization.name}.
            </p>
            <button
              type="button"
              className={primaryButtonClass}
              onClick={() => navigate('/', { replace: true })}
            >
              Open dashboard
            </button>
          </>
        ) : (
          <>
            <h1 className="text-lg font-extrabold">Accept your invitation</h1>
            <p className="text-sm leading-relaxed text-muted">
              You are signed in as{' '}
              <span className="font-bold">{user?.email ?? 'your account'}</span>. Accepting adds
              this account to the organization that invited you.
            </p>
            {!token ? (
              <StatusMessage tone="error">
                This link is missing its invitation token. Ask for a new invitation.
              </StatusMessage>
            ) : null}
            {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={primaryButtonClass}
                disabled={!token || pending}
                onClick={() => void handleAccept()}
              >
                {pending ? 'Accepting…' : 'Accept invitation'}
              </button>
              <Link to="/" className={`${subtleButtonClass} inline-flex items-center`}>
                Not now
              </Link>
            </div>
          </>
        )}
      </section>
    </div>
  );
};
