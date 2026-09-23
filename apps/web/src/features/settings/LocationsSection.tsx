import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { createLocationRequestSchema, updateLocationRequestSchema } from '@glampro/contracts';
import type { BusinessHour, LocationDetail, UpdateLocationRequest } from '@glampro/contracts';
import {
  apiErrorMessage,
  createLocation,
  fetchBusinessHours,
  fetchLocations,
  updateBusinessHours,
  updateLocation,
} from '../../lib/api';
import { useAuth } from '../auth/useAuth';
import {
  Field,
  PermissionNotice,
  SectionCard,
  StatusMessage,
  inputClass,
  primaryButtonClass,
} from './SettingsCommon';

const dayLabels = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

type LocationForm = {
  name: string;
  code: string;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postalCode: string;
  countryCode: string;
  timezone: string;
  receiptPrefix: string;
  pricesIncludeTax: boolean;
  isActive: boolean;
};

const locationFormFrom = (location: LocationDetail): LocationForm => ({
  name: location.name,
  code: location.code,
  phone: location.phone ?? '',
  email: location.email ?? '',
  addressLine1: location.addressLine1 ?? '',
  addressLine2: location.addressLine2 ?? '',
  city: location.city ?? '',
  postalCode: location.postalCode ?? '',
  countryCode: location.countryCode,
  timezone: location.timezone,
  receiptPrefix: location.receiptPrefix,
  pricesIncludeTax: location.pricesIncludeTax,
  isActive: location.isActive,
});

/** Empty strings clear the nullable columns; the receipt counter is never sent. */
const locationInputFrom = (form: LocationForm): UpdateLocationRequest => ({
  name: form.name.trim(),
  code: form.code.trim(),
  phone: form.phone.trim() === '' ? null : form.phone.trim(),
  email: form.email.trim() === '' ? null : form.email.trim(),
  addressLine1: form.addressLine1.trim() === '' ? null : form.addressLine1.trim(),
  addressLine2: form.addressLine2.trim() === '' ? null : form.addressLine2.trim(),
  city: form.city.trim() === '' ? null : form.city.trim(),
  postalCode: form.postalCode.trim() === '' ? null : form.postalCode.trim(),
  countryCode: form.countryCode.trim().toUpperCase(),
  timezone: form.timezone.trim(),
  receiptPrefix: form.receiptPrefix.trim(),
  pricesIncludeTax: form.pricesIncludeTax,
  isActive: form.isActive,
});

export const LocationsSection = () => {
  const { hasPermission } = useAuth();
  const allowed = hasPermission('settings.manage');

  const [locations, setLocations] = useState<LocationDetail[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({ name: '', code: '' });
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    fetchLocations()
      .then((data) => setLocations(data.locations))
      .catch((loadError: unknown) => setError(apiErrorMessage(loadError)));
  }, []);

  useEffect(() => {
    if (allowed) {
      load();
    }
  }, [allowed, load]);

  if (!allowed) {
    return <PermissionNotice permission="settings.manage" />;
  }

  if (!locations) {
    return (
      <SectionCard title="Locations" description="Loading locations…">
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      </SectionCard>
    );
  }

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const parsed = createLocationRequestSchema.safeParse({
      name: createForm.name.trim(),
      code: createForm.code.trim() === '' ? undefined : createForm.code.trim(),
    });

    if (!parsed.success) {
      setError('Enter a location name of at least two characters.');
      return;
    }

    setCreating(true);

    try {
      await createLocation(parsed.data);
      setCreateForm({ name: '', code: '' });
      load();
    } catch (createError) {
      setError(apiErrorMessage(createError));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <SectionCard
        title="Add a location"
        description="Each location has its own address, tax mode, receipt numbering, and business hours."
      >
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => void handleCreate(event)}
          noValidate
        >
          <Field label="Location name">
            <input
              className={inputClass}
              value={createForm.name}
              onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })}
              placeholder="Ann Siang"
              maxLength={160}
            />
          </Field>
          <Field label="Code" hint="Optional; derived from the name when empty.">
            <input
              className={inputClass}
              value={createForm.code}
              onChange={(event) => setCreateForm({ ...createForm, code: event.target.value })}
              placeholder="ANN"
              maxLength={30}
            />
          </Field>
          <button type="submit" disabled={creating} className={primaryButtonClass}>
            {creating ? 'Adding…' : 'Add location'}
          </button>
        </form>
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      </SectionCard>

      {locations.map((location) => (
        <LocationCard
          key={location.id}
          location={location}
          onSaved={(updated) =>
            setLocations((current) =>
              current
                ? current.map((entry) => (entry.id === updated.id ? updated : entry))
                : current,
            )
          }
        />
      ))}
    </div>
  );
};

const LocationCard = ({
  location,
  onSaved,
}: {
  location: LocationDetail;
  onSaved: (location: LocationDetail) => void;
}) => {
  const [form, setForm] = useState<LocationForm>(() => locationFormFrom(location));
  const [hours, setHours] = useState<BusinessHour[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [hoursSaved, setHoursSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const [hoursPending, setHoursPending] = useState(false);

  useEffect(() => {
    let active = true;

    fetchBusinessHours(location.id)
      .then((data) => {
        if (active) {
          setHours(data.hours);
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
  }, [location.id]);

  const updateField = (field: keyof LocationForm) => (value: string | boolean) => {
    setForm({ ...form, [field]: value });
    setSaved(false);
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSaved(false);

    const parsed = updateLocationRequestSchema.safeParse(locationInputFrom(form));

    if (!parsed.success) {
      setError('Please review the form fields — names need two characters and codes three.');
      return;
    }

    setPending(true);

    try {
      const { location: updated } = await updateLocation(location.id, parsed.data);
      setForm(locationFormFrom(updated));
      onSaved(updated);
      setSaved(true);
    } catch (saveError) {
      setError(apiErrorMessage(saveError));
    } finally {
      setPending(false);
    }
  };

  const setHourValue = (dayOfWeek: number, field: 'opensAt' | 'closesAt', value: string) => {
    setHours((current) =>
      current
        ? current.map((hour) =>
            hour.dayOfWeek === dayOfWeek ? { ...hour, [field]: value === '' ? null : value } : hour,
          )
        : current,
    );
    setHoursSaved(false);
  };

  const toggleClosed = (dayOfWeek: number) => {
    setHours((current) =>
      current
        ? current.map((hour) =>
            hour.dayOfWeek === dayOfWeek ? { ...hour, isClosed: !hour.isClosed } : hour,
          )
        : current,
    );
    setHoursSaved(false);
  };

  const handleSaveHours = async () => {
    if (!hours) {
      return;
    }

    setError(null);
    setHoursSaved(false);

    if (hours.some((hour) => !hour.isClosed && (!hour.opensAt || !hour.closesAt))) {
      setError('Open days need both an opening and a closing time.');
      return;
    }

    setHoursPending(true);

    try {
      const data = await updateBusinessHours(location.id, hours);
      setHours(data.hours);
      setHoursSaved(true);
    } catch (saveError) {
      setError(apiErrorMessage(saveError));
    } finally {
      setHoursPending(false);
    }
  };

  return (
    <>
      <SectionCard
        title={location.name}
        description={`Code ${location.code} · ${location.currency} · next receipt #${location.nextReceiptNumber}`}
        footer={
          <footer className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              form={`location-form-${location.id}`}
              disabled={pending}
              className={primaryButtonClass}
            >
              {pending ? 'Saving…' : 'Save location'}
            </button>
            {saved ? <StatusMessage tone="success">Location saved.</StatusMessage> : null}
            {hoursSaved ? (
              <StatusMessage tone="success">Business hours saved.</StatusMessage>
            ) : null}
            {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
          </footer>
        }
      >
        <form
          id={`location-form-${location.id}`}
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => void handleSave(event)}
          noValidate
        >
          <Field label="Name">
            <input
              className={inputClass}
              value={form.name}
              onChange={(event) => updateField('name')(event.target.value)}
              maxLength={160}
            />
          </Field>
          <Field label="Code">
            <input
              className={inputClass}
              value={form.code}
              onChange={(event) => updateField('code')(event.target.value.toUpperCase())}
              maxLength={30}
            />
          </Field>
          <Field label="Phone">
            <input
              className={inputClass}
              value={form.phone}
              onChange={(event) => updateField('phone')(event.target.value)}
              maxLength={40}
            />
          </Field>
          <Field label="Email">
            <input
              className={inputClass}
              value={form.email}
              onChange={(event) => updateField('email')(event.target.value)}
              maxLength={254}
            />
          </Field>
          <Field label="Address line 1">
            <input
              className={inputClass}
              value={form.addressLine1}
              onChange={(event) => updateField('addressLine1')(event.target.value)}
              maxLength={200}
            />
          </Field>
          <Field label="Address line 2">
            <input
              className={inputClass}
              value={form.addressLine2}
              onChange={(event) => updateField('addressLine2')(event.target.value)}
              maxLength={200}
            />
          </Field>
          <Field label="City">
            <input
              className={inputClass}
              value={form.city}
              onChange={(event) => updateField('city')(event.target.value)}
              maxLength={100}
            />
          </Field>
          <Field label="Postal code">
            <input
              className={inputClass}
              value={form.postalCode}
              onChange={(event) => updateField('postalCode')(event.target.value)}
              maxLength={30}
            />
          </Field>
          <Field label="Country code" hint="Two letters, for example SG.">
            <input
              className={inputClass}
              value={form.countryCode}
              onChange={(event) => updateField('countryCode')(event.target.value.toUpperCase())}
              maxLength={2}
            />
          </Field>
          <Field label="Timezone">
            <input
              className={inputClass}
              value={form.timezone}
              onChange={(event) => updateField('timezone')(event.target.value)}
              maxLength={100}
            />
          </Field>
          <Field label="Receipt prefix" hint="Letters and numbers only, for example SALE.">
            <input
              className={inputClass}
              value={form.receiptPrefix}
              onChange={(event) => updateField('receiptPrefix')(event.target.value.toUpperCase())}
              maxLength={20}
            />
          </Field>
          <div className="flex flex-col gap-3 pt-1">
            <label className="flex items-center gap-2 text-xs font-bold text-[#2B3160]">
              <input
                type="checkbox"
                checked={form.pricesIncludeTax}
                onChange={(event) => updateField('pricesIncludeTax')(event.target.checked)}
                className="h-4 w-4 accent-[#6C5CE7]"
              />
              Prices include tax
            </label>
            <label className="flex items-center gap-2 text-xs font-bold text-[#2B3160]">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => updateField('isActive')(event.target.checked)}
                className="h-4 w-4 accent-[#6C5CE7]"
              />
              Location active
            </label>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title={`Business hours — ${location.name}`}
        description="Opening hours per weekday. Close a day by ticking the box."
      >
        {hours ? (
          <div className="flex flex-col gap-2">
            {hours.map((hour) => (
              <div
                key={hour.dayOfWeek}
                className="grid grid-cols-[minmax(88px,1fr)_auto_1fr_1fr] items-center gap-3 rounded-xl border border-line bg-white px-3 py-2"
              >
                <span className="text-xs font-extrabold">{dayLabels[hour.dayOfWeek]}</span>
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-muted">
                  <input
                    type="checkbox"
                    checked={hour.isClosed}
                    onChange={() => toggleClosed(hour.dayOfWeek)}
                    className="h-4 w-4 accent-[#6C5CE7]"
                  />
                  Closed
                </label>
                <input
                  type="time"
                  className={inputClass}
                  value={hour.opensAt ?? ''}
                  disabled={hour.isClosed}
                  onChange={(event) => setHourValue(hour.dayOfWeek, 'opensAt', event.target.value)}
                  aria-label={`${dayLabels[hour.dayOfWeek]} opening time`}
                />
                <input
                  type="time"
                  className={inputClass}
                  value={hour.closesAt ?? ''}
                  disabled={hour.isClosed}
                  onChange={(event) => setHourValue(hour.dayOfWeek, 'closesAt', event.target.value)}
                  aria-label={`${dayLabels[hour.dayOfWeek]} closing time`}
                />
              </div>
            ))}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => void handleSaveHours()}
                disabled={hoursPending}
                className={primaryButtonClass}
              >
                {hoursPending ? 'Saving…' : 'Save business hours'}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs font-bold text-muted">Loading business hours…</p>
        )}
      </SectionCard>
    </>
  );
};
