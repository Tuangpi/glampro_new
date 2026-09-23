import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { OrganizationSettings, UpdateOrganizationRequest } from '@glampro/contracts';
import {
  apiErrorMessage,
  fetchOrganizationSettings,
  updateOrganizationSettings,
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

type FormState = {
  name: string;
  legalName: string;
  registrationNumber: string;
  gstRegistrationNumber: string;
  defaultTimezone: string;
  logoUrl: string;
  defaultCurrency: string;
};

const formFrom = (settings: OrganizationSettings): FormState => ({
  name: settings.name,
  legalName: settings.legalName ?? '',
  registrationNumber: settings.registrationNumber ?? '',
  gstRegistrationNumber: settings.gstRegistrationNumber ?? '',
  defaultTimezone: settings.defaultTimezone,
  logoUrl: settings.logoUrl ?? '',
  defaultCurrency: settings.defaultCurrency,
});

/** Empty strings clear the nullable columns; trimmed text is sent otherwise. */
const inputFrom = (form: FormState): UpdateOrganizationRequest => ({
  name: form.name.trim(),
  legalName: form.legalName.trim() === '' ? null : form.legalName.trim(),
  registrationNumber: form.registrationNumber.trim() === '' ? null : form.registrationNumber.trim(),
  gstRegistrationNumber:
    form.gstRegistrationNumber.trim() === '' ? null : form.gstRegistrationNumber.trim(),
  defaultTimezone: form.defaultTimezone.trim(),
  logoUrl: form.logoUrl.trim() === '' ? null : form.logoUrl.trim(),
});

export const OrganizationSettingsSection = () => {
  const { hasPermission } = useAuth();
  const allowed = hasPermission('settings.manage');

  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!allowed) {
      return;
    }

    let active = true;

    fetchOrganizationSettings()
      .then((settings) => {
        if (active) {
          setForm(formFrom(settings));
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
  }, [allowed]);

  if (!allowed) {
    return <PermissionNotice permission="settings.manage" />;
  }

  if (!form) {
    return (
      <SectionCard title="Organization" description="Loading organization settings…">
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      </SectionCard>
    );
  }

  const updateField = (field: keyof FormState) => (value: string) => {
    setForm({ ...form, [field]: value });
    setSaved(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setPending(true);

    try {
      const settings = await updateOrganizationSettings(inputFrom(form));
      setForm(formFrom(settings));
      setSaved(true);
    } catch (saveError) {
      setError(apiErrorMessage(saveError));
    } finally {
      setPending(false);
    }
  };

  return (
    <SectionCard
      title="Organization"
      description="Legal and tax details for the business. Currency and slug are fixed at registration."
      footer={
        <footer className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            form="organization-settings-form"
            disabled={pending}
            className={primaryButtonClass}
          >
            {pending ? 'Saving…' : 'Save changes'}
          </button>
          {saved ? <StatusMessage tone="success">Settings saved.</StatusMessage> : null}
          {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
        </footer>
      }
    >
      <form
        id="organization-settings-form"
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(event) => void handleSubmit(event)}
        noValidate
      >
        <Field label="Business name">
          <input
            className={inputClass}
            value={form.name}
            onChange={(event) => updateField('name')(event.target.value)}
            maxLength={160}
            required
          />
        </Field>
        <Field label="Timezone">
          <input
            className={inputClass}
            value={form.defaultTimezone}
            onChange={(event) => updateField('defaultTimezone')(event.target.value)}
            maxLength={100}
            required
          />
        </Field>
        <Field label="Legal name">
          <input
            className={inputClass}
            value={form.legalName}
            onChange={(event) => updateField('legalName')(event.target.value)}
            maxLength={200}
          />
        </Field>
        <Field label="Registration number">
          <input
            className={inputClass}
            value={form.registrationNumber}
            onChange={(event) => updateField('registrationNumber')(event.target.value)}
            maxLength={80}
          />
        </Field>
        <Field
          label="GST registration number"
          hint="Leave empty if the business is not GST-registered."
        >
          <input
            className={inputClass}
            value={form.gstRegistrationNumber}
            onChange={(event) => updateField('gstRegistrationNumber')(event.target.value)}
            maxLength={80}
          />
        </Field>
        <Field label="Logo URL">
          <input
            className={inputClass}
            value={form.logoUrl}
            onChange={(event) => updateField('logoUrl')(event.target.value)}
            maxLength={500}
            placeholder="https://…"
          />
        </Field>
        <p className="text-[11px] font-medium text-muted sm:col-span-2">
          Default currency: <span className="font-bold">{form.defaultCurrency}</span>
        </p>
      </form>
    </SectionCard>
  );
};
