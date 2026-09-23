import { useState } from 'react';
import type { Permission } from '@glampro/contracts';
import { PageHeader } from '../../components/layout/PageHeader';
import { useAuth } from '../auth/useAuth';
import { PermissionNotice } from '../shared/FormControls';
import { InventorySection } from './InventorySection';
import { ProductsSection } from './ProductsSection';
import { ServicesSection } from './ServicesSection';

type SectionKey = 'services' | 'products' | 'inventory';

type CatalogTab = { key: SectionKey; label: string; permission: Permission };

const tabs: CatalogTab[] = [
  { key: 'services', label: 'Services', permission: 'services.read' },
  { key: 'products', label: 'Products', permission: 'products.read' },
  { key: 'inventory', label: 'Inventory', permission: 'inventory.read' },
];

/**
 * Catalog shell: permission-aware tabs over the service menu, the retail
 * catalog, and the inventory ledger. A member with no read permission in any
 * area sees the permission notice instead of an empty tab list.
 */
export const CatalogPage = () => {
  const { hasPermission, activeMembership } = useAuth();
  const [activeTab, setActiveTab] = useState<SectionKey>('services');

  const visibleTabs = tabs.filter((tab) => hasPermission(tab.permission));
  const current = visibleTabs.some((tab) => tab.key === activeTab)
    ? activeTab
    : visibleTabs[0]?.key;

  return (
    <>
      <PageHeader
        title="Products & inventory"
        subtitle={activeMembership?.organization.name ?? 'GlamPro'}
      />
      <div className="flex flex-col gap-5 p-5 sm:p-7">
        <nav className="flex flex-wrap gap-2" aria-label="Catalog sections">
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

        {current === 'services' ? <ServicesSection /> : null}
        {current === 'products' ? <ProductsSection /> : null}
        {current === 'inventory' ? <InventorySection /> : null}
        {current === undefined ? <PermissionNotice permission="products.read" /> : null}
      </div>
    </>
  );
};
