import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { createAppointmentRequestSchema } from '@glampro/contracts';
import type {
  AvailabilitySlot,
  CustomerSummary,
  ServiceSummary,
  StaffProfileSummary,
} from '@glampro/contracts';
import {
  apiErrorMessage,
  createAppointment,
  fetchAvailability,
  fetchCustomers,
  fetchServices,
} from '../../lib/api';
import { formatSgd, formatTimeInZone } from '../../lib/format';
import {
  Field,
  SectionCard,
  StatusMessage,
  inputClass,
  primaryButtonClass,
  subtleButtonClass,
} from '../shared/FormControls';
import { customerNameOf, staffNameOf } from './appointmentView';

const contactLineOf = (customer: CustomerSummary) =>
  customer.phone ?? customer.email ?? customer.memberNumber ?? 'No contact details';

/**
 * Booking form for one day. Customers and services come from the modules that
 * own them; the start time is chosen from the availability the API derives from
 * the location's hours and the stylist's week, so the diary is only filled with
 * times that actually fit.
 */
export const AppointmentBookingForm = ({
  locationId,
  timezone,
  date,
  staffProfiles,
  onBooked,
  onClose,
}: {
  locationId: string;
  timezone: string;
  date: string;
  staffProfiles: StaffProfileSummary[];
  onBooked: () => void;
  onClose: () => void;
}) => {
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<CustomerSummary[] | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [staffProfileId, setStaffProfileId] = useState('');
  const [services, setServices] = useState<ServiceSummary[] | null>(null);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [slots, setSlots] = useState<AvailabilitySlot[] | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    fetchServices()
      .then((data) => setServices(data.services.filter((service) => service.isAvailable)))
      .catch((loadError: unknown) => setError(apiErrorMessage(loadError)));
  }, []);

  // Availability follows the stylist, the chosen services, and the day.
  useEffect(() => {
    setStartsAt(null);

    if (staffProfileId === '' || serviceIds.length === 0) {
      setSlots(null);
      return;
    }

    let active = true;

    fetchAvailability({ locationId, staffProfileId, date, serviceIds })
      .then((data) => {
        if (active) {
          setSlots(data.slots);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setSlots([]);
          setError(apiErrorMessage(loadError));
        }
      });

    return () => {
      active = false;
    };
  }, [date, locationId, serviceIds, staffProfileId]);

  const searchCustomers = async () => {
    setError(null);

    try {
      const search = query.trim();
      const data = await fetchCustomers(search === '' ? {} : { q: search });
      setCustomers(data.customers.filter((customer) => customer.isActive));
    } catch (searchError) {
      setError(apiErrorMessage(searchError));
    }
  };

  const toggleService = (serviceId: string) =>
    setServiceIds((current) =>
      current.includes(serviceId)
        ? current.filter((entry) => entry !== serviceId)
        : [...current, serviceId],
    );

  const chosenDuration = (services ?? [])
    .filter((service) => serviceIds.includes(service.id))
    .reduce((total, service) => total + service.durationMinutes, 0);

  const handleBook = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const parsed = createAppointmentRequestSchema.safeParse({
      locationId,
      customerId: customerId ?? '',
      staffProfileId,
      serviceIds,
      startsAt: startsAt ?? '',
      notes: notes.trim() === '' ? null : notes.trim(),
    });

    if (!parsed.success) {
      setError('Pick a customer, a stylist, at least one service, and a start time.');
      return;
    }

    setPending(true);

    try {
      await createAppointment(parsed.data);
      onBooked();
    } catch (bookError) {
      setError(apiErrorMessage(bookError));
    } finally {
      setPending(false);
    }
  };

  return (
    <SectionCard
      title="Book a visit"
      description={`Free times come from the salon's hours and the stylist's week, shown in ${timezone}.`}
      footer={
        <button type="button" className={subtleButtonClass} onClick={onClose}>
          Close
        </button>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={handleBook} noValidate>
        <div className="flex flex-col gap-3 rounded-xl border border-line p-3">
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Find a customer" hint="Name, email, phone, or member number.">
              <input
                className={inputClass}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Wei Ling"
                maxLength={80}
              />
            </Field>
            <button
              type="button"
              className={subtleButtonClass}
              onClick={() => void searchCustomers()}
            >
              Search
            </button>
          </div>

          {customers === null ? null : customers.length === 0 ? (
            <p className="text-xs font-bold text-muted">
              No customer matched. Add them in Customers first.
            </p>
          ) : (
            <ul className="flex max-h-44 flex-col gap-2 overflow-y-auto">
              {customers.map((customer) => (
                <li key={customer.id}>
                  <button
                    type="button"
                    onClick={() => setCustomerId(customer.id)}
                    aria-current={customerId === customer.id ? 'true' : undefined}
                    className={[
                      'flex w-full flex-col rounded-xl border px-3 py-2 text-left',
                      customerId === customer.id
                        ? 'border-brand bg-white'
                        : 'border-line bg-white hover:bg-canvas',
                    ].join(' ')}
                  >
                    <span className="text-xs font-extrabold">{customerNameOf(customer)}</span>
                    <span className="text-[11px] font-medium text-muted">
                      {contactLineOf(customer)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Field label="Stylist">
          <select
            className={inputClass}
            value={staffProfileId}
            onChange={(event) => setStaffProfileId(event.target.value)}
          >
            <option value="">Choose a stylist</option>
            {staffProfiles.map((staff) => (
              <option key={staff.id} value={staff.id}>
                {staffNameOf(staff)}
                {staff.jobTitle === null ? '' : ` · ${staff.jobTitle}`}
              </option>
            ))}
          </select>
        </Field>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-extrabold text-[#2B3160]">Services</span>
          {services === null ? (
            <p className="text-xs font-bold text-muted">Loading the service menu…</p>
          ) : services.length === 0 ? (
            <p className="text-xs font-bold text-muted">
              No bookable service yet. Add one under Products &amp; inventory.
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {services.map((service) => (
                <li key={service.id}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-line bg-white px-3 py-2">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={serviceIds.includes(service.id)}
                      onChange={() => toggleService(service.id)}
                    />
                    <span className="flex flex-col">
                      <span className="text-xs font-extrabold">{service.name}</span>
                      <span className="text-[11px] font-medium text-muted">
                        {service.durationMinutes} min · {formatSgd(service.priceInCents)}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {chosenDuration === 0 ? null : (
            <p className="text-[11px] font-bold text-muted">
              About {chosenDuration} minutes in total, starting on the day you are viewing.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-extrabold text-[#2B3160]">Start time</span>
          {slots === null ? (
            <p className="text-xs font-bold text-muted">
              Pick a stylist and at least one service to see the free times.
            </p>
          ) : slots.length === 0 ? (
            <p className="text-xs font-bold text-muted">
              Nothing free for that stylist and those services on this day.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {slots.map((slot) => (
                <button
                  key={slot.startsAt}
                  type="button"
                  onClick={() => setStartsAt(slot.startsAt)}
                  aria-current={startsAt === slot.startsAt ? 'true' : undefined}
                  className={[
                    'rounded-xl border px-3 py-1.5 text-xs font-extrabold',
                    startsAt === slot.startsAt
                      ? 'border-brand bg-brand text-white'
                      : 'border-line bg-white hover:bg-canvas',
                  ].join(' ')}
                >
                  {formatTimeInZone(slot.startsAt, timezone)}
                </button>
              ))}
            </div>
          )}
        </div>

        <Field label="Notes" hint="Optional, for example a parking note or a preference.">
          <input
            className={inputClass}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={1000}
          />
        </Field>

        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}

        <div className="flex items-center gap-2">
          <button type="submit" disabled={pending} className={primaryButtonClass}>
            {pending ? 'Booking…' : 'Book visit'}
          </button>
        </div>
      </form>
    </SectionCard>
  );
};
