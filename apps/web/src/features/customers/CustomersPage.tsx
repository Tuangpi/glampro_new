import { useCallback, useEffect, useState } from 'react';
import type { CustomerDetail, CustomerSummary } from '@glampro/contracts';
import { PageHeader } from '../../components/layout/PageHeader';
import { apiErrorMessage, fetchCustomer, fetchCustomers } from '../../lib/api';
import { useAuth } from '../auth/useAuth';
import { PermissionNotice, SectionCard, StatusMessage } from '../shared/FormControls';
import { CustomerBookSection } from './CustomerBookSection';
import { CustomerDetailSection } from './CustomerDetailSection';

/**
 * Customers: a searchable book on one side, the selected profile and its note
 * timeline on the other. Writes are gated by `customers.manage`, so a stylist
 * with read access sees the same book without the controls.
 */
export const CustomersPage = () => {
  const { hasPermission, activeMembership } = useAuth();
  const canRead = hasPermission('customers.read');
  const canManage = hasPermission('customers.manage');

  const [customers, setCustomers] = useState<CustomerSummary[] | null>(null);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback((search: string) => {
    const trimmed = search.trim();

    fetchCustomers(trimmed === '' ? {} : { q: trimmed })
      .then((data) => {
        setCustomers(data.customers);
        setSelectedId((current) => current ?? data.customers[0]?.id ?? null);
      })
      .catch((loadError: unknown) => setError(apiErrorMessage(loadError)));
  }, []);

  const loadDetail = useCallback((customerId: string | null) => {
    if (customerId === null) {
      setDetail(null);
      return;
    }

    fetchCustomer(customerId)
      .then((data) => setDetail(data.customer))
      .catch((loadError: unknown) => setError(apiErrorMessage(loadError)));
  }, []);

  useEffect(() => {
    if (canRead) {
      loadList(query);
    }
  }, [canRead, loadList, query]);

  useEffect(() => {
    if (canRead) {
      loadDetail(selectedId);
    }
  }, [canRead, loadDetail, selectedId]);

  if (!canRead) {
    return <PermissionNotice permission="customers.read" />;
  }

  const refresh = () => {
    loadList(query);
    loadDetail(selectedId);
  };

  return (
    <>
      <PageHeader title="Customers" subtitle={activeMembership?.organization.name ?? 'GlamPro'} />
      <div className="flex flex-col gap-5 p-5 sm:p-7">
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <CustomerBookSection
            customers={customers}
            query={query}
            selectedId={selectedId}
            canManage={canManage}
            onSelect={setSelectedId}
            onSearch={setQuery}
            onCreated={(customerId) => {
              setSelectedId(customerId);
              loadList('');
            }}
          />

          <div className="flex flex-col gap-5">
            {detail === null ? (
              <SectionCard
                title="Customer profile"
                description="Select a customer from the book to see their profile and notes."
              >
                <p className="text-xs font-bold text-muted">Nothing selected.</p>
              </SectionCard>
            ) : (
              <CustomerDetailSection
                key={detail.id}
                customer={detail}
                canManage={canManage}
                onChanged={refresh}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
};
