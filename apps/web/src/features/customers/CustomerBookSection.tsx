import { useState } from 'react';
import type { FormEvent } from 'react';
import { createCustomerRequestSchema } from '@glampro/contracts';
import type { CustomerSummary } from '@glampro/contracts';
import { apiErrorMessage, createCustomer } from '../../lib/api';
import {
  Field,
  SectionCard,
  StatusMessage,
  inputClass,
  primaryButtonClass,
  subtleButtonClass,
} from '../shared/FormControls';

type CustomerForm = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
};

const emptyForm = (): CustomerForm => ({ firstName: '', lastName: '', phone: '', email: '' });

/** The list shows the name, with the best contact detail available underneath. */
const contactLineOf = (customer: CustomerSummary) =>
  customer.phone ?? customer.email ?? customer.memberNumber ?? 'No contact details';

const displayNameOf = (customer: CustomerSummary) =>
  [customer.firstName, customer.lastName].filter(Boolean).join(' ');

/**
 * The customer book: search, the create form, and the selectable list. It owns
 * the form state and reports a new customer's ID upwards so the page can select
 * it and refresh the list.
 */
export const CustomerBookSection = ({
  customers,
  query,
  selectedId,
  canManage,
  onSelect,
  onSearch,
  onCreated,
}: {
  customers: CustomerSummary[] | null;
  query: string;
  selectedId: string | null;
  canManage: boolean;
  onSelect: (customerId: string) => void;
  onSearch: (query: string) => void;
  onCreated: (customerId: string) => void;
}) => {
  const [searchInput, setSearchInput] = useState(query);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const parsed = createCustomerRequestSchema.safeParse({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim() === '' ? null : form.lastName.trim(),
      phone: form.phone.trim() === '' ? null : form.phone.trim(),
      email: form.email.trim() === '' ? null : form.email.trim(),
    });

    if (!parsed.success) {
      setError('Enter at least a first name, and check the email address.');
      return;
    }

    setCreating(true);

    try {
      const { customer } = await createCustomer(parsed.data);
      setForm(emptyForm());
      setSearchInput('');
      onCreated(customer.id);
    } catch (createError) {
      setError(apiErrorMessage(createError));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <SectionCard
        title="Find a customer"
        description="Search by name, email, phone, or member number."
      >
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch(searchInput);
          }}
          noValidate
        >
          <Field label="Search">
            <input
              className={inputClass}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Wei Ling"
              maxLength={80}
            />
          </Field>
          <button type="submit" className={primaryButtonClass}>
            Search
          </button>
          {query === '' ? null : (
            <button
              type="button"
              className={subtleButtonClass}
              onClick={() => {
                setSearchInput('');
                onSearch('');
              }}
            >
              Clear
            </button>
          )}
        </form>
      </SectionCard>

      {canManage ? (
        <SectionCard title="New customer" description="Only a first name is required.">
          <form className="flex flex-col gap-3" onSubmit={handleCreate} noValidate>
            <Field label="First name">
              <input
                className={inputClass}
                value={form.firstName}
                onChange={(event) => setForm({ ...form, firstName: event.target.value })}
                maxLength={80}
              />
            </Field>
            <Field label="Last name">
              <input
                className={inputClass}
                value={form.lastName}
                onChange={(event) => setForm({ ...form, lastName: event.target.value })}
                maxLength={80}
              />
            </Field>
            <Field label="Phone">
              <input
                className={inputClass}
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                maxLength={40}
              />
            </Field>
            <Field label="Email">
              <input
                className={inputClass}
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                maxLength={254}
              />
            </Field>
            <div>
              <button type="submit" disabled={creating} className={primaryButtonClass}>
                {creating ? 'Adding…' : 'Add customer'}
              </button>
            </div>
            {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
          </form>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Customer book"
        description={query === '' ? 'Everyone recorded for this salon.' : `Matching “${query}”.`}
      >
        {customers === null ? (
          <p className="text-xs font-bold text-muted">Loading the book…</p>
        ) : customers.length === 0 ? (
          <p className="text-xs font-bold text-muted">No customer matches that search.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {customers.map((customer) => (
              <li key={customer.id}>
                <button
                  type="button"
                  onClick={() => onSelect(customer.id)}
                  aria-current={customer.id === selectedId ? 'true' : undefined}
                  className={[
                    'flex w-full flex-col rounded-xl border px-3 py-2.5 text-left transition-colors',
                    customer.id === selectedId
                      ? 'border-brand bg-[#F7F4FF]'
                      : 'border-line bg-white hover:bg-canvas',
                  ].join(' ')}
                >
                  <span className="truncate text-xs font-extrabold">{displayNameOf(customer)}</span>
                  <span className="truncate text-[11px] font-bold text-muted">
                    {contactLineOf(customer)}
                    {customer.isActive ? '' : ' · inactive'}
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
