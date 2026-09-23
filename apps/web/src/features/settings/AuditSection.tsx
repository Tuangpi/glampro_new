import { useEffect, useState } from 'react';
import type { AuditLogPage } from '@glampro/contracts';
import { apiErrorMessage, fetchAuditLog } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useAuth } from '../auth/useAuth';
import { PermissionNotice, SectionCard, StatusMessage, subtleButtonClass } from './SettingsCommon';

const pageSize = 10;

export const AuditSection = () => {
  const { hasPermission } = useAuth();
  const allowed = hasPermission('audit.read');

  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditLogPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) {
      return;
    }

    let active = true;

    fetchAuditLog({ page, pageSize })
      .then((result) => {
        if (active) {
          setData(result);
          setError(null);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(apiErrorMessage(loadError));
        }
      });

    return () => {
      active = false;
    };
  }, [allowed, page]);

  if (!allowed) {
    return <PermissionNotice permission="audit.read" />;
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <SectionCard
      title="Audit log"
      description="Membership, invitation, and settings changes in this organization, newest first."
      footer={
        data ? (
          <footer className="flex flex-wrap items-center gap-3 text-xs font-bold text-muted">
            <button
              type="button"
              className={subtleButtonClass}
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous
            </button>
            <span>
              Page {data.page} of {totalPages} · {data.total} entries
            </span>
            <button
              type="button"
              className={subtleButtonClass}
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </footer>
        ) : null
      }
    >
      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      {data ? (
        data.items.length === 0 ? (
          <p className="text-xs font-bold text-muted">No activity recorded yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {data.items.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-3 py-2.5 text-xs">
                <span className="w-36 shrink-0 font-bold text-muted">
                  {formatDateTime(entry.createdAt)}
                </span>
                <span className="font-extrabold">{entry.action}</span>
                <span className="min-w-0 flex-1 truncate text-muted">
                  {entry.actor
                    ? `${entry.actor.firstName} ${entry.actor.lastName}`
                    : entry.actorType}
                </span>
                {entry.entityType ? <span className="text-muted">{entry.entityType}</span> : null}
                {entry.requestId ? (
                  <span className="font-mono text-[10px] text-muted">
                    {entry.requestId.slice(0, 8)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : error ? null : (
        <p className="text-xs font-bold text-muted">Loading activity…</p>
      )}
    </SectionCard>
  );
};
