import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  createServiceRequestSchema,
  serviceCategoryRequestSchema,
  updateServiceRequestSchema,
} from '@glampro/contracts';
import type {
  ServiceCategorySummary,
  ServiceSummary,
  UpdateServiceRequest,
} from '@glampro/contracts';
import {
  apiErrorMessage,
  createService,
  createServiceCategory,
  fetchServiceCategories,
  fetchServices,
  updateService,
} from '../../lib/api';
import { formatSgd } from '../../lib/format';
import { useAuth } from '../auth/useAuth';
import {
  Field,
  PermissionNotice,
  SectionCard,
  StatusMessage,
  inputClass,
  primaryButtonClass,
  subtleButtonClass,
} from '../shared/FormControls';

type ServiceForm = {
  name: string;
  durationMinutes: string;
  price: string;
  isAvailable: boolean;
};

const emptyForm = (): ServiceForm => ({
  name: '',
  durationMinutes: '45',
  price: '',
  isAvailable: true,
});

/** Prices are entered in dollars and sent as integer cents, matching the API. */
const priceInCentsOf = (price: string) => Math.round(Number(price) * 100);

const formFrom = (service: ServiceSummary): ServiceForm => ({
  name: service.name,
  durationMinutes: String(service.durationMinutes),
  price: (service.priceInCents / 100).toFixed(2),
  isAvailable: service.isAvailable,
});

export const ServicesSection = () => {
  const { hasPermission } = useAuth();
  const canRead = hasPermission('services.read');
  const canManage = hasPermission('services.manage');

  const [categories, setCategories] = useState<ServiceCategorySummary[] | null>(null);
  const [services, setServices] = useState<ServiceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const [categoryPending, setCategoryPending] = useState(false);

  const load = useCallback(() => {
    Promise.all([fetchServiceCategories(), fetchServices()])
      .then(([categoryData, serviceData]) => {
        setCategories(categoryData.serviceCategories);
        setServices(serviceData.services);
      })
      .catch((loadError: unknown) => setError(apiErrorMessage(loadError)));
  }, []);

  useEffect(() => {
    if (canRead) {
      load();
    }
  }, [canRead, load]);

  if (!canRead) {
    return <PermissionNotice permission="services.read" />;
  }

  const handleAddCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const parsed = serviceCategoryRequestSchema.safeParse({ name: newCategory.trim() });

    if (!parsed.success) {
      setError('Enter a category name.');
      return;
    }

    setCategoryPending(true);

    try {
      await createServiceCategory(parsed.data);
      setNewCategory('');
      load();
    } catch (createError) {
      setError(apiErrorMessage(createError));
    } finally {
      setCategoryPending(false);
    }
  };

  if (!categories || !services) {
    return (
      <SectionCard title="Service menu" description="Loading the service catalog…">
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      </SectionCard>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {canManage ? (
        <SectionCard
          title="Add a service category"
          description="Categories group the services shown on the menu, for example Cuts, Colour, or Treatments."
        >
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => void handleAddCategory(event)}
            noValidate
          >
            <Field label="Category name">
              <input
                className={inputClass}
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
                placeholder="Cuts"
                maxLength={120}
              />
            </Field>
            <button type="submit" disabled={categoryPending} className={primaryButtonClass}>
              {categoryPending ? 'Adding…' : 'Add category'}
            </button>
          </form>
          {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
        </SectionCard>
      ) : null}

      {categories.length === 0 ? (
        <SectionCard
          title="No service categories yet"
          description="Create a category before adding services to the menu."
        >
          <p className="text-xs font-bold text-muted">Nothing to show.</p>
        </SectionCard>
      ) : (
        categories.map((category) => (
          <ServiceCategoryCard
            key={category.id}
            category={category}
            services={services.filter((service) => service.serviceCategoryId === category.id)}
            canManage={canManage}
            onChanged={load}
          />
        ))
      )}
    </div>
  );
};

const ServiceCategoryCard = ({
  category,
  services,
  canManage,
  onChanged,
}: {
  category: ServiceCategorySummary;
  services: ServiceSummary[];
  canManage: boolean;
  onChanged: () => void;
}) => {
  const [form, setForm] = useState<ServiceForm>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const parsed = createServiceRequestSchema.safeParse({
      serviceCategoryId: category.id,
      name: form.name.trim(),
      durationMinutes: Number(form.durationMinutes),
      priceInCents: priceInCentsOf(form.price),
      isAvailable: form.isAvailable,
    });

    if (!parsed.success) {
      setError('Enter a name, a duration in whole minutes, and a price.');
      return;
    }

    setPending(true);

    try {
      await createService(parsed.data);
      setForm(emptyForm());
      onChanged();
    } catch (createError) {
      setError(apiErrorMessage(createError));
    } finally {
      setPending(false);
    }
  };

  return (
    <SectionCard
      title={category.name}
      description={`${services.length} service${services.length === 1 ? '' : 's'} in this category`}
    >
      {services.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {services.map((service) => (
            <ServiceRow key={service.id} service={service} canManage={canManage} />
          ))}
        </ul>
      ) : (
        <p className="text-xs font-bold text-muted">No services in this category yet.</p>
      )}

      {canManage ? (
        <form
          className="grid gap-3 border-t border-line pt-4 sm:grid-cols-4"
          onSubmit={(event) => void handleCreate(event)}
          noValidate
        >
          <Field label="Service name">
            <input
              className={inputClass}
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Women’s cut"
              maxLength={160}
            />
          </Field>
          <Field label="Duration (minutes)">
            <input
              className={inputClass}
              type="number"
              min={0}
              max={1440}
              value={form.durationMinutes}
              onChange={(event) => setForm({ ...form, durationMinutes: event.target.value })}
            />
          </Field>
          <Field label="Price (SGD)">
            <input
              className={inputClass}
              type="number"
              min={0}
              step="0.01"
              value={form.price}
              onChange={(event) => setForm({ ...form, price: event.target.value })}
              placeholder="45.00"
            />
          </Field>
          <div className="flex items-end">
            <button type="submit" disabled={pending} className={primaryButtonClass}>
              {pending ? 'Adding…' : 'Add service'}
            </button>
          </div>
          {error ? (
            <div className="sm:col-span-4">
              <StatusMessage tone="error">{error}</StatusMessage>
            </div>
          ) : null}
        </form>
      ) : null}
    </SectionCard>
  );
};

/** One service line: availability toggles immediately, price and duration save. */
const ServiceRow = ({ service, canManage }: { service: ServiceSummary; canManage: boolean }) => {
  const [form, setForm] = useState<ServiceForm>(() => formFrom(service));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  const save = async (input: UpdateServiceRequest) => {
    setError(null);
    setSaved(false);
    setPending(true);

    try {
      const { service: updated } = await updateService(service.id, input);
      setForm(formFrom(updated));
      setSaved(true);
    } catch (saveError) {
      setError(apiErrorMessage(saveError));
    } finally {
      setPending(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parsed = updateServiceRequestSchema.safeParse({
      name: form.name.trim(),
      durationMinutes: Number(form.durationMinutes),
      priceInCents: priceInCentsOf(form.price),
    });

    if (!parsed.success) {
      setError('Enter a name, a duration in whole minutes, and a price.');
      return;
    }

    void save(parsed.data);
  };

  return (
    <li className="rounded-xl border border-line bg-white px-3 py-3">
      <form
        className="grid items-end gap-3 sm:grid-cols-[minmax(140px,1fr)_110px_120px_auto]"
        onSubmit={handleSubmit}
        noValidate
      >
        <Field label="Name">
          <input
            className={inputClass}
            value={form.name}
            disabled={!canManage}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            maxLength={160}
          />
        </Field>
        <Field label="Minutes">
          <input
            className={inputClass}
            type="number"
            min={0}
            max={1440}
            value={form.durationMinutes}
            disabled={!canManage}
            onChange={(event) => setForm({ ...form, durationMinutes: event.target.value })}
          />
        </Field>
        <Field label="Price (SGD)">
          <input
            className={inputClass}
            type="number"
            min={0}
            step="0.01"
            value={form.price}
            disabled={!canManage}
            onChange={(event) => setForm({ ...form, price: event.target.value })}
          />
        </Field>
        <div className="flex items-center gap-2">
          {canManage ? (
            <button type="submit" disabled={pending} className={subtleButtonClass}>
              {pending ? 'Saving…' : 'Save'}
            </button>
          ) : (
            <span className="text-xs font-extrabold text-ink">
              {formatSgd(service.priceInCents)}
            </span>
          )}
        </div>
      </form>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[11px] font-bold text-[#2B3160]">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[#6C5CE7]"
            checked={form.isAvailable}
            disabled={!canManage || pending}
            onChange={(event) => {
              const isAvailable = event.target.checked;
              setForm({ ...form, isAvailable });
              void save({ isAvailable });
            }}
          />
          Bookable
        </label>
        {saved ? <StatusMessage tone="success">Service saved.</StatusMessage> : null}
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      </div>
    </li>
  );
};
