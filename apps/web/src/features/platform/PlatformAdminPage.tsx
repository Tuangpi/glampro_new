import { useCallback, useEffect, useState } from 'react';
import type {
  PlatformOrganizationActionRequest,
  PlatformSubscriptionActionRequest,
} from '@glampro/contracts';
import {
  apiErrorMessage,
  changePlatformOrganizationStatus,
  changePlatformSubscriptionStatus,
  fetchPlatformOrganizations,
  fetchPlatformOverview,
} from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useAuth } from '../auth/useAuth';
import {
  SectionCard,
  StatusMessage,
  primaryButtonClass,
  subtleButtonClass,
} from '../shared/FormControls';

const organizationActions: PlatformOrganizationActionRequest['action'][] = [
  'SUSPEND',
  'ACTIVATE',
  'CANCEL',
];
const subscriptionActions: PlatformSubscriptionActionRequest['action'][] = [
  'PAUSE',
  'RESUME',
  'CANCEL',
];

const statusLabel = (value: string) =>
  value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/(^| )\S/g, (letter) => letter.toUpperCase());

export const PlatformAdminPage = () => {
  const { user } = useAuth();
  const allowed = user?.platformRole === 'PLATFORM_ADMIN';
  const [overview, setOverview] = useState<Awaited<
    ReturnType<typeof fetchPlatformOverview>
  > | null>(null);
  const [organizations, setOrganizations] = useState<Awaited<
    ReturnType<typeof fetchPlatformOrganizations>
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextOverview, nextOrganizations] = await Promise.all([
        fetchPlatformOverview(),
        fetchPlatformOrganizations({ page: 1, pageSize: 25 }),
      ]);
      setOverview(nextOverview);
      setOrganizations(nextOrganizations);
      setError(null);
    } catch (loadError) {
      setError(apiErrorMessage(loadError));
    }
  }, []);

  useEffect(() => {
    if (allowed) {
      void load();
    }
  }, [allowed, load]);

  if (!allowed) {
    return (
      <SectionCard
        title="Platform administration"
        description="Platform administrator access is required."
      >
        <p className="text-xs font-bold text-muted">
          This area is restricted to GlamPro platform administrators.
        </p>
      </SectionCard>
    );
  }

  const act = async (
    organizationId: string,
    action:
      PlatformOrganizationActionRequest['action'] | PlatformSubscriptionActionRequest['action'],
    kind: 'organization' | 'subscription',
  ) => {
    const reason = window.prompt(`Reason for ${action.toLowerCase()} (required):`);
    if (!reason?.trim()) {
      return;
    }
    setBusy(`${organizationId}:${kind}`);
    setError(null);
    setNotice(null);
    try {
      if (kind === 'organization') {
        await changePlatformOrganizationStatus(organizationId, {
          action: action as PlatformOrganizationActionRequest['action'],
          reason: reason.trim(),
        });
      } else {
        await changePlatformSubscriptionStatus(organizationId, {
          action: action as PlatformSubscriptionActionRequest['action'],
          reason: reason.trim(),
        });
      }
      setNotice(`${statusLabel(action)} completed for the organization.`);
      await load();
    } catch (actionError) {
      setError(apiErrorMessage(actionError));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-5 p-5 sm:p-7">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-extrabold">Platform administration</h1>
        <p className="text-xs text-muted">
          Cross-tenant subscription health and organization controls.
        </p>
      </header>
      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      {notice ? <StatusMessage tone="success">{notice}</StatusMessage> : null}
      {overview ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Organizations', overview.organizations.total],
            ['Active', overview.organizations.active],
            ['Past due', overview.organizations.pastDue],
            ['Paused subscriptions', overview.subscriptions.paused],
          ].map(([label, value]) => (
            <section className="panel p-4" key={String(label)}>
              <p className="text-[10px] font-extrabold uppercase tracking-wide text-muted">
                {label}
              </p>
              <p className="mt-2 text-2xl font-extrabold">{value}</p>
            </section>
          ))}
        </div>
      ) : null}
      <SectionCard
        title="Organizations"
        description="Newest organizations first. Actions are audited and synchronized with Stripe when configured."
      >
        {!organizations ? (
          <p className="text-xs font-bold text-muted">Loading organizations…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead>
                <tr className="border-b border-line text-[10px] uppercase tracking-wide text-muted">
                  <th className="pb-3">Organization</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Subscription</th>
                  <th className="pb-3">Members</th>
                  <th className="pb-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {organizations.organizations.map((organization) => (
                  <tr key={organization.id} className="align-top">
                    <td className="py-3 pr-4">
                      <p className="font-extrabold">{organization.name}</p>
                      <p className="text-[10px] text-muted">
                        {organization.slug} · {organization.currency}
                      </p>
                    </td>
                    <td className="py-3 pr-4 font-bold">{statusLabel(organization.status)}</td>
                    <td className="py-3 pr-4">
                      {organization.subscription ? (
                        <>
                          <p className="font-bold">
                            {statusLabel(organization.subscription.status)}
                          </p>
                          <p className="text-[10px] text-muted">
                            {organization.subscription.planCode}
                          </p>
                        </>
                      ) : (
                        'None'
                      )}
                    </td>
                    <td className="py-3 pr-4">{organization.memberCount}</td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2">
                        {organizationActions.map((action) => (
                          <button
                            key={action}
                            type="button"
                            disabled={busy === `${organization.id}:organization`}
                            className={
                              action === 'CANCEL' || action === 'SUSPEND'
                                ? subtleButtonClass
                                : primaryButtonClass
                            }
                            onClick={() => void act(organization.id, action, 'organization')}
                          >
                            {statusLabel(action)}
                          </button>
                        ))}
                        {organization.subscription
                          ? subscriptionActions.map((action) => (
                              <button
                                key={action}
                                type="button"
                                disabled={busy === `${organization.id}:subscription`}
                                className={subtleButtonClass}
                                onClick={() => void act(organization.id, action, 'subscription')}
                              >
                                Sub {statusLabel(action)}
                              </button>
                            ))
                          : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {organizations.organizations.length === 0 ? (
              <p className="text-xs font-bold text-muted">No organizations found.</p>
            ) : null}
          </div>
        )}
      </SectionCard>
      {overview?.recentOrganizations.length ? (
        <SectionCard
          title="Recent organizations"
          description="The latest accounts created on the platform."
        >
          <ul className="divide-y divide-line">
            {overview.recentOrganizations.map((organization) => (
              <li
                key={organization.id}
                className="flex items-center justify-between gap-4 py-2.5 text-xs"
              >
                <span className="font-extrabold">{organization.name}</span>
                <span className="text-muted">{formatDateTime(organization.createdAt)}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}
    </div>
  );
};
