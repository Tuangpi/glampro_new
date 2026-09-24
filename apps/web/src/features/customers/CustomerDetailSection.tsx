import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  createCustomerNoteRequestSchema,
  customerGenders,
  updateCustomerRequestSchema,
} from '@glampro/contracts';
import type {
  AppointmentSummary,
  CustomerDetail,
  CustomerGender,
  CustomerSummary,
  SaleSummary,
  UpdateCustomerRequest,
} from '@glampro/contracts';
import {
  apiErrorMessage,
  createCustomerNote,
  fetchAppointments,
  fetchSales,
  updateCustomer,
} from '../../lib/api';
import { formatDate, formatDateTime, formatSgd } from '../../lib/format';
import { useAuth } from '../auth/useAuth';
import {
  Field,
  SectionCard,
  StatusMessage,
  inputClass,
  primaryButtonClass,
} from '../shared/FormControls';
import {
  appointmentStatusLabels,
  appointmentStatusTone,
  staffNameOf,
} from '../appointments/appointmentView';
import { saleStatusLabels, saleStatusTone } from '../sales/saleView';

const genderLabels: Record<CustomerGender, string> = {
  FEMALE: 'Female',
  MALE: 'Male',
  OTHER: 'Other',
  UNDISCLOSED: 'Undisclosed',
};

type CustomerForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: CustomerGender | '';
  addressLine1: string;
  addressLine2: string;
  city: string;
  postalCode: string;
  countryCode: string;
  memberNumber: string;
  isActive: boolean;
};

const customerFormFrom = (customer: CustomerSummary): CustomerForm => ({
  firstName: customer.firstName,
  lastName: customer.lastName ?? '',
  email: customer.email ?? '',
  phone: customer.phone ?? '',
  dateOfBirth: customer.dateOfBirth ?? '',
  gender: customer.gender ?? '',
  addressLine1: customer.addressLine1 ?? '',
  addressLine2: customer.addressLine2 ?? '',
  city: customer.city ?? '',
  postalCode: customer.postalCode ?? '',
  countryCode: customer.countryCode,
  memberNumber: customer.memberNumber ?? '',
  isActive: customer.isActive,
});

/** Empty strings clear the nullable columns; the country code is never optional. */
const customerInputFrom = (form: CustomerForm): UpdateCustomerRequest => ({
  firstName: form.firstName.trim(),
  lastName: form.lastName.trim() === '' ? null : form.lastName.trim(),
  email: form.email.trim() === '' ? null : form.email.trim(),
  phone: form.phone.trim() === '' ? null : form.phone.trim(),
  dateOfBirth: form.dateOfBirth.trim() === '' ? null : form.dateOfBirth.trim(),
  gender: form.gender === '' ? null : form.gender,
  addressLine1: form.addressLine1.trim() === '' ? null : form.addressLine1.trim(),
  addressLine2: form.addressLine2.trim() === '' ? null : form.addressLine2.trim(),
  city: form.city.trim() === '' ? null : form.city.trim(),
  postalCode: form.postalCode.trim() === '' ? null : form.postalCode.trim(),
  countryCode: form.countryCode.trim().toUpperCase(),
  memberNumber: form.memberNumber.trim() === '' ? null : form.memberNumber.trim(),
  isActive: form.isActive,
});

const displayNameOf = (customer: CustomerDetail) =>
  [customer.firstName, customer.lastName].filter(Boolean).join(' ');

/**
 * One customer in full: the editable profile on top, appointment and sales history,
 * and the append-only note timeline underneath. A
 * member without `customers.manage` reads all of it and edits none, so the same
 * screen serves the front desk and a stylist.
 */
export const CustomerDetailSection = ({
  customer,
  canManage,
  onChanged,
}: {
  customer: CustomerDetail;
  canManage: boolean;
  onChanged: () => void;
}) => {
  const { hasPermission } = useAuth();
  const canReadVisits = hasPermission('appointments.read');
  const canReadSales = hasPermission('sales.read');

  const [form, setForm] = useState(() => customerFormFrom(customer));
  const [visits, setVisits] = useState<AppointmentSummary[] | null>(null);
  const [sales, setSales] = useState<SaleSummary[] | null>(null);
  const [noteBody, setNoteBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const [notePending, setNotePending] = useState(false);

  const updateField =
    <K extends keyof CustomerForm>(key: K) =>
    (value: CustomerForm[K]) =>
      setForm((current) => ({ ...current, [key]: value }));

  // Visit and sales history are derived from the customer's related records.
  useEffect(() => {
    if (!canReadVisits) {
      return;
    }

    let active = true;

    fetchAppointments({ customerId: customer.id, limit: 20 })
      .then((data) => {
        if (active) {
          setVisits(data.appointments);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setVisits([]);
          setError(apiErrorMessage(loadError));
        }
      });

    return () => {
      active = false;
    };
  }, [canReadVisits, customer.id]);

  useEffect(() => {
    if (!canReadSales) return;
    let active = true;
    fetchSales({ customerId: customer.id, limit: 20 })
      .then((data) => {
        if (active) setSales(data.sales);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setSales([]);
          setError(apiErrorMessage(loadError));
        }
      });
    return () => {
      active = false;
    };
  }, [canReadSales, customer.id]);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSaved(false);

    const parsed = updateCustomerRequestSchema.safeParse(customerInputFrom(form));

    if (!parsed.success) {
      setError('Enter at least a first name, a valid email, and a two-letter country code.');
      return;
    }

    setPending(true);

    try {
      const { customer: updated } = await updateCustomer(customer.id, parsed.data);
      setForm(customerFormFrom(updated));
      setSaved(true);
      onChanged();
    } catch (saveError) {
      setError(apiErrorMessage(saveError));
    } finally {
      setPending(false);
    }
  };

  const handleAddNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNoteError(null);

    const parsed = createCustomerNoteRequestSchema.safeParse({ body: noteBody.trim() });

    if (!parsed.success) {
      setNoteError('Write something before adding the note.');
      return;
    }

    setNotePending(true);

    try {
      await createCustomerNote(customer.id, parsed.data);
      setNoteBody('');
      onChanged();
    } catch (saveError) {
      setNoteError(apiErrorMessage(saveError));
    } finally {
      setNotePending(false);
    }
  };

  return (
    <>
      <SectionCard
        title={displayNameOf(customer)}
        description={
          customer.isActive ? 'Active customer' : 'Inactive customer — not counted as a regular'
        }
      >
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSave} noValidate>
          <Field label="First name">
            <input
              className={inputClass}
              value={form.firstName}
              disabled={!canManage}
              onChange={(event) => updateField('firstName')(event.target.value)}
              maxLength={80}
            />
          </Field>
          <Field label="Last name">
            <input
              className={inputClass}
              value={form.lastName}
              disabled={!canManage}
              onChange={(event) => updateField('lastName')(event.target.value)}
              maxLength={80}
            />
          </Field>
          <Field label="Email">
            <input
              className={inputClass}
              type="email"
              value={form.email}
              disabled={!canManage}
              onChange={(event) => updateField('email')(event.target.value)}
              maxLength={254}
            />
          </Field>
          <Field label="Phone">
            <input
              className={inputClass}
              value={form.phone}
              disabled={!canManage}
              onChange={(event) => updateField('phone')(event.target.value)}
              maxLength={40}
            />
          </Field>
          <Field label="Date of birth">
            <input
              className={inputClass}
              type="date"
              value={form.dateOfBirth}
              disabled={!canManage}
              onChange={(event) => updateField('dateOfBirth')(event.target.value)}
            />
          </Field>
          <Field label="Gender">
            <select
              className={inputClass}
              value={form.gender}
              disabled={!canManage}
              onChange={(event) => updateField('gender')(event.target.value as CustomerGender | '')}
            >
              <option value="">Not recorded</option>
              {customerGenders.map((gender) => (
                <option key={gender} value={gender}>
                  {genderLabels[gender]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Address line 1">
            <input
              className={inputClass}
              value={form.addressLine1}
              disabled={!canManage}
              onChange={(event) => updateField('addressLine1')(event.target.value)}
              maxLength={200}
            />
          </Field>
          <Field label="Address line 2">
            <input
              className={inputClass}
              value={form.addressLine2}
              disabled={!canManage}
              onChange={(event) => updateField('addressLine2')(event.target.value)}
              maxLength={200}
            />
          </Field>
          <Field label="City">
            <input
              className={inputClass}
              value={form.city}
              disabled={!canManage}
              onChange={(event) => updateField('city')(event.target.value)}
              maxLength={100}
            />
          </Field>
          <Field label="Postal code">
            <input
              className={inputClass}
              value={form.postalCode}
              disabled={!canManage}
              onChange={(event) => updateField('postalCode')(event.target.value)}
              maxLength={30}
            />
          </Field>
          <Field label="Country code" hint="Two letters, for example SG or MY.">
            <input
              className={inputClass}
              value={form.countryCode}
              disabled={!canManage}
              onChange={(event) => updateField('countryCode')(event.target.value.toUpperCase())}
              maxLength={2}
            />
          </Field>
          <Field label="Member number" hint="Matches a loyalty card or a legacy member ID.">
            <input
              className={inputClass}
              value={form.memberNumber}
              disabled={!canManage}
              onChange={(event) => updateField('memberNumber')(event.target.value)}
              maxLength={40}
            />
          </Field>

          {canManage ? (
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <button type="submit" disabled={pending} className={primaryButtonClass}>
                {pending ? 'Saving…' : 'Save profile'}
              </button>
              <label className="flex items-center gap-2 text-xs font-bold text-[#2B3160]">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#6C5CE7]"
                  checked={form.isActive}
                  onChange={(event) => updateField('isActive')(event.target.checked)}
                />
                Customer active
              </label>
              {saved ? <StatusMessage tone="success">Customer saved.</StatusMessage> : null}
            </div>
          ) : null}

          {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
        </form>
      </SectionCard>
      <SectionCard
        title="Notes"
        description={`Customer since ${formatDate(customer.createdAt)}. Notes are append-only.`}
      >
        {canManage ? (
          <form className="flex flex-col gap-2" onSubmit={handleAddNote} noValidate>
            <textarea
              className={`${inputClass} min-h-[88px] resize-y`}
              value={noteBody}
              onChange={(event) => setNoteBody(event.target.value)}
              placeholder="Prefers a quiet chair, allergic to a specific colour line…"
              maxLength={1000}
            />
            <div className="flex items-center gap-3">
              <button type="submit" disabled={notePending} className={primaryButtonClass}>
                {notePending ? 'Adding…' : 'Add note'}
              </button>
              {noteError ? <StatusMessage tone="error">{noteError}</StatusMessage> : null}
            </div>
          </form>
        ) : null}

        {customer.notes.length === 0 ? (
          <p className="text-xs font-bold text-muted">No notes yet.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {customer.notes.map((note) => (
              <li key={note.id} className="rounded-xl border border-line bg-white px-3 py-2.5">
                <p className="text-xs leading-relaxed text-ink">{note.body}</p>
                <p className="pt-1 text-[11px] font-bold text-muted">
                  {note.author
                    ? `${note.author.firstName} ${note.author.lastName}`
                    : 'Removed member'}
                  {' · '}
                  {formatDateTime(note.createdAt)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>
      <SectionCard
        title="Visit history"
        description="Appointments and sales recorded for this customer."
      >
        {!canReadVisits ? (
          <p className="text-xs font-bold text-muted">
            The appointments.read permission is needed to see visit history.
          </p>
        ) : visits === null ? (
          <p className="text-xs font-bold text-muted">Loading visits…</p>
        ) : visits.length === 0 ? (
          <p className="text-xs font-bold text-muted">No visits recorded yet.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {visits.map((visit) => (
              <li
                key={visit.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 py-2.5"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-xs font-extrabold">
                    {formatDateTime(visit.startsAt)} · {staffNameOf(visit.staff)}
                  </span>
                  <span className="text-[11px] font-bold text-muted">
                    {visit.services.map((service) => service.name).join(' + ') || 'No services'}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-[11px] font-extrabold">
                    {formatSgd(visit.priceInCents)}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${appointmentStatusTone(visit.status)}`}
                  >
                    {appointmentStatusLabels[visit.status]}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
        {canReadSales ? (
          <div className="mt-5 border-t border-line pt-5">
            <h3 className="mb-3 text-xs font-extrabold">Sales</h3>
            {sales === null ? (
              <p className="text-xs font-bold text-muted">Loading sales…</p>
            ) : sales.length === 0 ? (
              <p className="text-xs font-bold text-muted">No sales recorded yet.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {sales.map((sale) => (
                  <li
                    key={sale.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 py-2.5"
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-extrabold">{sale.receiptCode}</span>
                      <span className="text-[11px] font-bold text-muted">
                        {formatDateTime(sale.createdAt)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs font-extrabold">{formatSgd(sale.totalInCents)}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${saleStatusTone[sale.status]}`}
                      >
                        {saleStatusLabels[sale.status]}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : null}
      </SectionCard>
    </>
  );
};
