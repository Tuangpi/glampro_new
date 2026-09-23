import { useCallback, useEffect, useState } from 'react';
import type { Permission, StaffProfileDetail, StaffProfileSummary } from '@glampro/contracts';
import { PageHeader } from '../../components/layout/PageHeader';
import { apiErrorMessage, fetchStaffProfile, fetchStaffProfiles } from '../../lib/api';
import { useAuth } from '../auth/useAuth';
import { PermissionNotice, SectionCard, StatusMessage } from '../shared/FormControls';
import { StaffProfileSection } from './StaffProfileSection';
import { StaffRosterSection } from './StaffRosterSection';
import { StaffScheduleSection } from './StaffScheduleSection';
import { StaffServicesSection } from './StaffServicesSection';
import { StaffTimeOffSection } from './StaffTimeOffSection';

type SectionKey = 'profile' | 'services' | 'schedule' | 'timeOff';

const tabs: { key: SectionKey; label: string; permission: Permission }[] = [
  { key: 'profile', label: 'Profiles', permission: 'staff.read' },
  { key: 'services', label: 'Services', permission: 'staff.read' },
  { key: 'schedule', label: 'Schedule', permission: 'staff.read' },
  { key: 'timeOff', label: 'Time off', permission: 'staff.read' },
];

/**
 * Staff: the roster on the left, the selected person's roster detail on the
 * right. Services, the week, and time off all belong to one profile, so the
 * selection is held here and shared by the tabs.
 */
export const StaffPage = () => {
  const { hasPermission, activeMembership } = useAuth();
  const canRead = hasPermission('staff.read');
  const canManage = hasPermission('staff.manage');

  const [staffProfiles, setStaffProfiles] = useState<StaffProfileSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StaffProfileDetail | null>(null);
  const [activeTab, setActiveTab] = useState<SectionKey>('profile');
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(() => {
    fetchStaffProfiles()
      .then((data) => {
        setStaffProfiles(data.staffProfiles);
        setSelectedId((current) => current ?? data.staffProfiles[0]?.id ?? null);
      })
      .catch((loadError: unknown) => setError(apiErrorMessage(loadError)));
  }, []);

  const loadDetail = useCallback((staffProfileId: string | null) => {
    if (staffProfileId === null) {
      setDetail(null);
      return;
    }

    fetchStaffProfile(staffProfileId)
      .then((data) => setDetail(data.staffProfile))
      .catch((loadError: unknown) => setError(apiErrorMessage(loadError)));
  }, []);

  useEffect(() => {
    if (canRead) {
      loadList();
    }
  }, [canRead, loadList]);

  useEffect(() => {
    if (canRead) {
      loadDetail(selectedId);
    }
  }, [canRead, loadDetail, selectedId]);

  if (!canRead) {
    return <PermissionNotice permission="staff.read" />;
  }

  const refresh = () => {
    loadList();
    loadDetail(selectedId);
  };

  const visibleTabs = tabs.filter((tab) => hasPermission(tab.permission));
  const current = visibleTabs.some((tab) => tab.key === activeTab)
    ? activeTab
    : visibleTabs[0]?.key;

  return (
    <>
      <PageHeader title="Staff" subtitle={activeMembership?.organization.name ?? 'GlamPro'} />
      <div className="flex flex-col gap-5 p-5 sm:p-7">
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          <StaffRosterSection
            staffProfiles={staffProfiles}
            selectedId={selectedId}
            canManage={canManage}
            onSelect={setSelectedId}
            onCreated={(staffProfileId) => {
              setSelectedId(staffProfileId);
              loadList();
            }}
          />

          <div className="flex flex-col gap-5">
            <nav className="flex flex-wrap gap-2" aria-label="Staff sections">
              {visibleTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  aria-current={current === tab.key ? 'page' : undefined}
                  className={[
                    'rounded-full px-4 py-2 text-xs font-extrabold transition-colors',
                    current === tab.key
                      ? 'bg-brand text-white shadow-brand'
                      : 'border border-line bg-white text-[#2B3160] hover:bg-canvas',
                  ].join(' ')}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            {detail === null ? (
              <SectionCard
                title="Roster detail"
                description="Add someone to the roster, or pick a name on the left."
              >
                <p className="text-xs font-bold text-muted">Nothing selected.</p>
              </SectionCard>
            ) : null}

            {detail !== null && current === 'profile' ? (
              <StaffProfileSection
                key={detail.id}
                staffProfile={detail}
                canManage={canManage}
                onChanged={refresh}
              />
            ) : null}

            {detail !== null && current === 'services' ? (
              <StaffServicesSection
                key={detail.id}
                staffProfile={detail}
                canManage={canManage}
                onChanged={refresh}
              />
            ) : null}

            {detail !== null && current === 'schedule' ? (
              <StaffScheduleSection
                key={detail.id}
                staffProfile={detail}
                canManage={canManage}
                onChanged={refresh}
              />
            ) : null}

            {detail !== null && current === 'timeOff' ? (
              <StaffTimeOffSection
                key={detail.id}
                staffProfile={detail}
                canManage={canManage}
                onChanged={refresh}
              />
            ) : null}

            {current === undefined ? <PermissionNotice permission="staff.read" /> : null}
          </div>
        </div>
      </div>
    </>
  );
};
