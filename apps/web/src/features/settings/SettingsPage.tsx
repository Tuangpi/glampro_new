import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Permission } from '@glampro/contracts';
import { PageHeader } from '../../components/layout/PageHeader';
import { useAuth } from '../auth/useAuth';
import { AuditSection } from './AuditSection';
import { BillingSection } from './BillingSection';
import { LocationsSection } from './LocationsSection';
import { MembersSection } from './MembersSection';
import { OrganizationSettingsSection } from './OrganizationSettingsSection';
import { PermissionNotice } from './SettingsCommon';

type SectionKey = 'organization' | 'locations' | 'members' | 'billing' | 'audit';

type SettingsTab = { key: SectionKey; label: string; permission: Permission };

const tabs: SettingsTab[] = [
  { key: 'organization', label: 'Organization', permission: 'settings.manage' },
  { key: 'locations', label: 'Locations', permission: 'settings.manage' },
  { key: 'members', label: 'Members', permission: 'members.manage' },
  { key: 'billing', label: 'Billing', permission: 'billing.manage' },
  { key: 'audit', label: 'Audit log', permission: 'audit.read' },
];

/**
 * Settings shell: permission-aware tabs over the tenancy sections. The module
 * itself is only navigable with `settings.manage`, so an empty tab list means the
 * URL was reached directly without that permission.
 */
export const SettingsPage = () => {
  const { hasPermission, activeMembership } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<SectionKey>(() =>
    tabs.some((tab) => tab.key === requestedTab) ? (requestedTab as SectionKey) : 'organization',
  );

  const visibleTabs = tabs.filter((tab) => hasPermission(tab.permission));
  const current = visibleTabs.some((tab) => tab.key === activeTab)
    ? activeTab
    : visibleTabs[0]?.key;

  return (
    <>
      <PageHeader title="Settings" subtitle={activeMembership?.organization.name ?? 'GlamPro'} />
      <div className="flex flex-col gap-5 p-5 sm:p-7">
        <nav className="flex flex-wrap gap-2" aria-label="Settings sections">
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

        {current === 'organization' ? <OrganizationSettingsSection /> : null}
        {current === 'locations' ? <LocationsSection /> : null}
        {current === 'members' ? <MembersSection /> : null}
        {current === 'billing' ? <BillingSection /> : null}
        {current === 'audit' ? <AuditSection /> : null}
        {current === undefined ? <PermissionNotice permission="settings.manage" /> : null}
      </div>
    </>
  );
};
