import { useCallback, useEffect, useState } from 'react';
import type { ServiceSummary, StaffProfileDetail } from '@glampro/contracts';
import { apiErrorMessage, fetchServices, replaceStaffServices } from '../../lib/api';
import { formatSgd } from '../../lib/format';
import { useAuth } from '../auth/useAuth';
import {
  PermissionNotice,
  SectionCard,
  StatusMessage,
  primaryButtonClass,
} from '../shared/FormControls';

/**
 * Which services this person performs. The set is replaced whole, so ticking and
 * unticking boxes and saving once is a single request.
 */
export const StaffServicesSection = ({
  staffProfile,
  canManage,
  onChanged,
}: {
  staffProfile: StaffProfileDetail;
  canManage: boolean;
  onChanged: () => void;
}) => {
  const { hasPermission } = useAuth();
  const canReadCatalog = hasPermission('services.read');

  const [services, setServices] = useState<ServiceSummary[] | null>(null);
  const [selected, setSelected] = useState<string[]>(() =>
    staffProfile.services.map((service) => service.id),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  const load = useCallback(() => {
    fetchServices()
      .then((data) => setServices(data.services))
      .catch((loadError: unknown) => setError(apiErrorMessage(loadError)));
  }, []);

  useEffect(() => {
    if (canReadCatalog) {
      load();
    }
  }, [canReadCatalog, load]);

  if (!canReadCatalog) {
    return <PermissionNotice permission="services.read" />;
  }

  const toggle = (serviceId: string) => {
    setSaved(false);
    setSelected((current) =>
      current.includes(serviceId)
        ? current.filter((id) => id !== serviceId)
        : [...current, serviceId],
    );
  };

  const handleSave = async () => {
    setError(null);
    setSaved(false);
    setPending(true);

    try {
      await replaceStaffServices(staffProfile.id, { serviceIds: selected });
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
      title="Services performed"
      description="Only the services ticked here can be booked with this person."
    >
      {services === null ? (
        <p className="text-xs font-bold text-muted">Loading the service menu…</p>
      ) : services.length === 0 ? (
        <p className="text-xs font-bold text-muted">
          The service menu is empty. Add services under Products &amp; inventory first.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {services.map((service) => (
            <li key={service.id}>
              <label className="flex items-center gap-3 rounded-xl border border-line bg-white px-3 py-2.5">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#6C5CE7]"
                  checked={selected.includes(service.id)}
                  disabled={!canManage || pending}
                  onChange={() => toggle(service.id)}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-xs font-extrabold">{service.name}</span>
                  <span className="text-[11px] font-bold text-muted">
                    {service.durationMinutes} min · {formatSgd(service.priceInCents)}
                    {service.isAvailable ? '' : ' · currently unavailable'}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={pending || services === null}
            className={primaryButtonClass}
          >
            {pending ? 'Saving…' : 'Save assignments'}
          </button>
          {saved ? <StatusMessage tone="success">Assignments saved.</StatusMessage> : null}
        </div>
      ) : null}

      {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
    </SectionCard>
  );
};
