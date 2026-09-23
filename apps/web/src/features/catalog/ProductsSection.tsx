import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  createProductRequestSchema,
  productCategoryRequestSchema,
  updateProductRequestSchema,
} from '@glampro/contracts';
import type {
  ProductCategorySummary,
  ProductSummary,
  UpdateProductRequest,
} from '@glampro/contracts';
import {
  apiErrorMessage,
  createProduct,
  createProductCategory,
  fetchProductCategories,
  fetchProducts,
  updateProduct,
} from '../../lib/api';
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

type ProductForm = {
  name: string;
  sku: string;
  price: string;
  cost: string;
  trackInventory: boolean;
  isAvailable: boolean;
};

const emptyForm = (): ProductForm => ({
  name: '',
  sku: '',
  price: '',
  cost: '',
  trackInventory: true,
  isAvailable: true,
});

/** Prices are entered in dollars and sent as integer cents, matching the API. */
const centsOf = (value: string) => Math.round(Number(value) * 100);

const optionalCentsOf = (value: string) =>
  value.trim() === '' ? undefined : Math.round(Number(value) * 100);

const formFrom = (product: ProductSummary): ProductForm => ({
  name: product.name,
  sku: product.sku ?? '',
  price: (product.priceInCents / 100).toFixed(2),
  cost: product.costInCents === null ? '' : (product.costInCents / 100).toFixed(2),
  trackInventory: product.trackInventory,
  isAvailable: product.isAvailable,
});

export const ProductsSection = () => {
  const { hasPermission } = useAuth();
  const canRead = hasPermission('products.read');
  const canManage = hasPermission('products.manage');

  const [categories, setCategories] = useState<ProductCategorySummary[] | null>(null);
  const [products, setProducts] = useState<ProductSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const [categoryPending, setCategoryPending] = useState(false);

  const load = useCallback(() => {
    Promise.all([fetchProductCategories(), fetchProducts()])
      .then(([categoryData, productData]) => {
        setCategories(categoryData.productCategories);
        setProducts(productData.products);
      })
      .catch((loadError: unknown) => setError(apiErrorMessage(loadError)));
  }, []);

  useEffect(() => {
    if (canRead) {
      load();
    }
  }, [canRead, load]);

  if (!canRead) {
    return <PermissionNotice permission="products.read" />;
  }

  const handleAddCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const parsed = productCategoryRequestSchema.safeParse({ name: newCategory.trim() });

    if (!parsed.success) {
      setError('Enter a category name.');
      return;
    }

    setCategoryPending(true);

    try {
      await createProductCategory(parsed.data);
      setNewCategory('');
      load();
    } catch (createError) {
      setError(apiErrorMessage(createError));
    } finally {
      setCategoryPending(false);
    }
  };

  if (!categories || !products) {
    return (
      <SectionCard title="Retail catalog" description="Loading the product catalog…">
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      </SectionCard>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {canManage ? (
        <SectionCard
          title="Add a product category"
          description="Categories group retail lines, for example Retail, Professional, or Gift cards."
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
                placeholder="Retail"
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
          title="No product categories yet"
          description="Create a category before adding retail products."
        >
          <p className="text-xs font-bold text-muted">Nothing to show.</p>
        </SectionCard>
      ) : (
        categories.map((category) => (
          <ProductCategoryCard
            key={category.id}
            category={category}
            products={products.filter((product) => product.productCategoryId === category.id)}
            canManage={canManage}
            onChanged={load}
          />
        ))
      )}
    </div>
  );
};

const ProductCategoryCard = ({
  category,
  products,
  canManage,
  onChanged,
}: {
  category: ProductCategorySummary;
  products: ProductSummary[];
  canManage: boolean;
  onChanged: () => void;
}) => {
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const parsed = createProductRequestSchema.safeParse({
      productCategoryId: category.id,
      name: form.name.trim(),
      sku: form.sku.trim() === '' ? undefined : form.sku.trim().toUpperCase(),
      priceInCents: centsOf(form.price),
      costInCents: optionalCentsOf(form.cost),
      trackInventory: form.trackInventory,
      isAvailable: form.isAvailable,
    });

    if (!parsed.success) {
      setError('Enter a name and a price. Leave the SKU blank when unused.');
      return;
    }

    setPending(true);

    try {
      await createProduct(parsed.data);
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
      description={`${products.length} product${products.length === 1 ? '' : 's'} in this category`}
    >
      {products.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {products.map((product) => (
            <ProductRow key={product.id} product={product} canManage={canManage} />
          ))}
        </ul>
      ) : (
        <p className="text-xs font-bold text-muted">No products in this category yet.</p>
      )}

      {canManage ? (
        <form
          className="grid gap-3 border-t border-line pt-4 sm:grid-cols-5"
          onSubmit={(event) => void handleCreate(event)}
          noValidate
        >
          <Field label="Product name">
            <input
              className={inputClass}
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Shampoo 1L"
              maxLength={160}
            />
          </Field>
          <Field label="SKU" hint="Optional, unique per organization.">
            <input
              className={inputClass}
              value={form.sku}
              onChange={(event) => setForm({ ...form, sku: event.target.value.toUpperCase() })}
              maxLength={64}
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
              placeholder="18.00"
            />
          </Field>
          <Field label="Cost (SGD)" hint="Optional.">
            <input
              className={inputClass}
              type="number"
              min={0}
              step="0.01"
              value={form.cost}
              onChange={(event) => setForm({ ...form, cost: event.target.value })}
            />
          </Field>
          <div className="flex items-end">
            <button type="submit" disabled={pending} className={primaryButtonClass}>
              {pending ? 'Adding…' : 'Add product'}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-4 sm:col-span-5">
            <label className="flex items-center gap-2 text-[11px] font-bold text-[#2B3160]">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#6C5CE7]"
                checked={form.trackInventory}
                onChange={(event) => setForm({ ...form, trackInventory: event.target.checked })}
              />
              Track inventory
            </label>
            <label className="flex items-center gap-2 text-[11px] font-bold text-[#2B3160]">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#6C5CE7]"
                checked={form.isAvailable}
                onChange={(event) => setForm({ ...form, isAvailable: event.target.checked })}
              />
              Available for sale
            </label>
          </div>
          {error ? (
            <div className="sm:col-span-5">
              <StatusMessage tone="error">{error}</StatusMessage>
            </div>
          ) : null}
        </form>
      ) : null}
    </SectionCard>
  );
};

/** One product line: availability toggles immediately, the rest saves on submit. */
const ProductRow = ({ product, canManage }: { product: ProductSummary; canManage: boolean }) => {
  const [form, setForm] = useState<ProductForm>(() => formFrom(product));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  const save = async (input: UpdateProductRequest) => {
    setError(null);
    setSaved(false);
    setPending(true);

    try {
      const { product: updated } = await updateProduct(product.id, input);
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

    const parsed = updateProductRequestSchema.safeParse({
      name: form.name.trim(),
      sku: form.sku.trim() === '' ? null : form.sku.trim().toUpperCase(),
      priceInCents: centsOf(form.price),
      costInCents: form.cost.trim() === '' ? null : centsOf(form.cost),
    });

    if (!parsed.success) {
      setError('Enter a name and a price. The SKU must be unique.');
      return;
    }

    void save(parsed.data);
  };

  return (
    <li className="rounded-xl border border-line bg-white px-3 py-3">
      <form
        className="grid items-end gap-3 sm:grid-cols-[minmax(130px,1fr)_130px_110px_110px_auto]"
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
        <Field label="SKU">
          <input
            className={inputClass}
            value={form.sku}
            disabled={!canManage}
            onChange={(event) => setForm({ ...form, sku: event.target.value.toUpperCase() })}
            placeholder="—"
            maxLength={64}
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
        <Field label="Cost (SGD)">
          <input
            className={inputClass}
            type="number"
            min={0}
            step="0.01"
            value={form.cost}
            disabled={!canManage}
            onChange={(event) => setForm({ ...form, cost: event.target.value })}
            placeholder="—"
          />
        </Field>
        <div className="flex items-center gap-2">
          {canManage ? (
            <button type="submit" disabled={pending} className={subtleButtonClass}>
              {pending ? 'Saving…' : 'Save'}
            </button>
          ) : null}
        </div>
      </form>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[11px] font-bold text-[#2B3160]">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[#6C5CE7]"
            checked={form.trackInventory}
            disabled={!canManage || pending}
            onChange={(event) => {
              const trackInventory = event.target.checked;
              setForm({ ...form, trackInventory });
              void save({ trackInventory });
            }}
          />
          Track inventory
        </label>
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
          Available for sale
        </label>
        {saved ? <StatusMessage tone="success">Product saved.</StatusMessage> : null}
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
      </div>
    </li>
  );
};
