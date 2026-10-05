/**
 * Products & Inventory — handoff screen 08.
 *
 * **One catalogue, two tabs.** Products and Services are the tabs this screen
 * builds. The handoff also draws Packages and Gift cards, and neither is here
 * because the model has no package or gift-card catalogue to list yet — an empty
 * tab would read to a salon as "this salon has none", which is a different and
 * wrong statement (`docs/design/HANDOFF.md` §6 item 5). They arrive with the phase
 * that has the data behind them. There is no Services entry on the rail for the
 * same reason the tab exists (ADR 0005).
 *
 * **The Cost column and the "Inventory value" tile are absent.** Neither the schema
 * nor the legacy database the schema was derived from ever held a cost, so both
 * numbers would be invented — the checklist's rule again: the screen changes where
 * it disagrees with the real model, and a fabricated figure is worse than a missing
 * one. They return when there is a cost to show.
 *
 * **Every tile is a server-side count, not a sum over the rows on screen.** The
 * salon's whole catalogue is the question and one page of it is not the answer
 * (ADR 0010), which is why the tiles call `?lowStock=true` with `pageSize=1` rather
 * than counting what happens to be loaded. They sit above the tab row exactly as
 * drawn, because they describe the shelf rather than the table below: switching to
 * Services does not change how many products are low on stock. As the handoff draws
 * them, they are informative — not filters.
 *
 * The search box matches the name **or the description**, which is the API's rule
 * for `?search=` (`catalogueWhere`), so one box serves both tabs.
 */
import { useEffect, useState } from "react";

import type {
  CatalogStatusValue,
  ProductDetail,
  ProductSummary,
  ServiceDetail,
  ServiceSummary,
} from "@glampro/shared";

import ProductFormDrawer from "@/components/catalogue/ProductFormDrawer";
import ServiceFormDrawer from "@/components/catalogue/ServiceFormDrawer";
import { AlertTriangle, Package, Scissors, Search } from "@/components/icons";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Pagination from "@/components/ui/Pagination";
import Skeleton from "@/components/ui/Skeleton";
import StatTile from "@/components/ui/StatTile";
import Table, { type TableColumn } from "@/components/ui/Table";
import Tabs, { type TabItem } from "@/components/ui/Tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useProductCount, useProductList } from "@/hooks/useProducts";
import { useServiceCount, useServiceList } from "@/hooks/useServices";
import { get, getErrorMessage } from "@/lib/api";
import { cn, formatDuration, formatPrice } from "@/lib/utils";

const PAGE_SIZE = 20;

type CatalogueTab = "products" | "services";

export default function Products() {
  const { isReadOnly } = useAuth();

  const [tab, setTab] = useState<CatalogueTab>("products");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editingProduct, setEditingProduct] = useState<ProductDetail | null>(null);
  const [editingService, setEditingService] = useState<ServiceDetail | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Typing should not fire a query per keystroke, but the box must still feel
  // immediate, so the term is debounced rather than submitted.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const products = useProductList({ page, pageSize: PAGE_SIZE, search: search || undefined });
  const services = useServiceList({ page, pageSize: PAGE_SIZE, search: search || undefined });

  // Tiles. Each number is a server-side count over the whole catalogue (ADR 0010):
  // "Total items" adds the two catalogue counts together, and the low-stock count is
  // literally the rail badge's own query, so the rail and the tile cannot disagree.
  const productTotal = useProductCount();
  const lowStock = useProductCount({ lowStock: true });
  const outOfStock = useProductCount({ lowStock: true, threshold: 0 });
  const serviceTotal = useServiceCount();

  const isProducts = tab === "products";

  function openCreate() {
    setEditingProduct(null);
    setEditingService(null);
    setDrawerOpen(true);
  }

  async function openEditProduct(product: ProductSummary) {
    // A list row is a summary and the form needs the whole record, so opening the
    // editor is a second read rather than a re-use of the row.
    setEditingProduct(await get<ProductDetail>(`/products/${product.id}`));
    setDrawerOpen(true);
  }

  async function openEditService(service: ServiceSummary) {
    setEditingService(await get<ServiceDetail>(`/services/${service.id}`));
    setDrawerOpen(true);
  }

  // Kept in tab order: Item / Price / Member price / Stock / Status, which is the
  // handoff's own row minus the Cost column it draws and the model cannot fill.
  const productColumns: TableColumn<ProductSummary>[] = [
    {
      key: "item",
      header: "Item",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-bold text-ink">{row.name}</p>
          <p className="truncate text-xs text-ink-muted">{row.departmentName ?? "Unassigned"}</p>
        </div>
      ),
    },
    {
      key: "price",
      header: "Price",
      align: "right",
      cell: (row) => formatPrice(row.nonmemberPrice),
    },
    {
      key: "memberPrice",
      header: "Member price",
      align: "right",
      cell: (row) => formatPrice(row.memberPrice),
    },
    { key: "stock", header: "Stock", align: "right", cell: (row) => <StockCell product={row} /> },
    { key: "status", header: "Status", cell: (row) => <StatusCell status={row.status} /> },
    // A suspended salon may look but not change (TENANCY.md §6), so the shell's
    // banner is not the only place that has to say so.
    ...(isReadOnly
      ? []
      : [
          {
            key: "actions",
            header: "Edit",
            align: "right" as const,
            cell: (row: ProductSummary) => (
              <Button variant="secondary" size="sm" onClick={() => void openEditProduct(row)}>
                Edit
              </Button>
            ),
          },
        ]),
  ];

  // The services row is the handoff's service shape: the same prices, a duration a
  // product has no use for, and no stock column because a service is not stock.
  const serviceColumns: TableColumn<ServiceSummary>[] = [
    {
      key: "item",
      header: "Item",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-bold text-ink">{row.name}</p>
          <p className="truncate text-xs text-ink-muted">{row.departmentName ?? "Unassigned"}</p>
        </div>
      ),
    },
    {
      key: "price",
      header: "Price",
      align: "right",
      cell: (row) => formatPrice(row.nonmemberPrice),
    },
    {
      key: "memberPrice",
      header: "Member price",
      align: "right",
      cell: (row) => formatPrice(row.memberPrice),
    },
    {
      key: "duration",
      header: "Duration",
      align: "right",
      cell: (row) => formatDuration(row.durationMinutes),
    },
    { key: "status", header: "Status", cell: (row) => <StatusCell status={row.status} /> },
    ...(isReadOnly
      ? []
      : [
          {
            key: "actions",
            header: "Edit",
            align: "right" as const,
            cell: (row: ServiceSummary) => (
              <Button variant="secondary" size="sm" onClick={() => void openEditService(row)}>
                Edit
              </Button>
            ),
          },
        ]),
  ];

  // Each panel renders only while its tab is the active one, so the two lists are
  // never asked for at once and each panel is handed its own tab's state.
  const tabs: TabItem[] = [
    {
      id: "products",
      label: "Products",
      content: (
        <CataloguePanel<ProductSummary>
          noun="product"
          caption="Products in this salon"
          addLabel="Add product"
          columns={productColumns}
          rows={products.data?.data ?? []}
          search={search}
          isReadOnly={isReadOnly}
          isPending={products.isPending}
          isFetching={products.isFetching}
          isError={products.isError}
          error={products.error}
          total={products.data?.total ?? 0}
          page={products.data?.page ?? page}
          pageCount={products.data?.pageCount ?? 1}
          onAdd={openCreate}
          onPageChange={setPage}
          onClearSearch={() => setSearchInput("")}
        />
      ),
    },
    {
      id: "services",
      label: "Services",
      content: (
        <CataloguePanel<ServiceSummary>
          noun="service"
          caption="Services in this salon"
          addLabel="Add service"
          columns={serviceColumns}
          rows={services.data?.data ?? []}
          search={search}
          isReadOnly={isReadOnly}
          isPending={services.isPending}
          isFetching={services.isFetching}
          isError={services.isError}
          error={services.error}
          total={services.data?.total ?? 0}
          page={services.data?.page ?? page}
          pageCount={services.data?.pageCount ?? 1}
          onAdd={openCreate}
          onPageChange={setPage}
          onClearSearch={() => setSearchInput("")}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg text-ink">Products &amp; Inventory</h2>
          <p className="text-sm text-ink-muted">
            Everything the salon sells. Search by name or description.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="catalogue-search">
            Search items
          </label>
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-ink-muted"
            />
            <input
              id="catalogue-search"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search items…"
              className="h-control w-64 rounded-md border border-line bg-surface pr-3 pl-9 text-sm text-ink transition-colors placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-purple"
            />
          </div>

          <Button onClick={openCreate} disabled={isReadOnly}>
            {isProducts ? "Add product" : "Add service"}
          </Button>
        </div>
      </header>

      {/* Above the tab row, as drawn: these are facts about the shelf rather than
          about the table, so they do not change when the tabs do. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          icon={<Package />}
          value={
            productTotal.data && serviceTotal.data
              ? productTotal.data.total + serviceTotal.data.total
              : undefined
          }
          label="Total items"
        />
        <StatTile
          icon={<AlertTriangle />}
          value={lowStock.data?.total}
          label="Low stock"
          tone="warning"
        />
        <StatTile
          icon={<AlertTriangle />}
          value={outOfStock.data?.total}
          label="Out of stock"
          tone="danger"
        />
      </div>

      <Tabs
        label="Catalogue"
        items={tabs}
        activeId={tab}
        onChange={(id) => {
          setTab(id as CatalogueTab);
          // A page number only means something for the list it belongs to.
          setPage(1);
        }}
      />

      {isProducts ? (
        <ProductFormDrawer
          // Remounting on open and on record change is what clears the form. An
          // effect copying props into state would render twice on every open, and
          // resetting the record alone would leave a stale edit behind on reopen.
          key={`product:${editingProduct?.id ?? "new"}:${drawerOpen}`}
          open={drawerOpen}
          product={editingProduct}
          onClose={() => setDrawerOpen(false)}
        />
      ) : (
        <ServiceFormDrawer
          key={`service:${editingService?.id ?? "new"}:${drawerOpen}`}
          open={drawerOpen}
          service={editingService}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * Stock reads as a number, not as a colour: the count is the message and the tint
 * only repeats it. Zero and low are different states — the screen has a tile for
 * each — so they do not share a colour.
 */
function StockCell({ product }: { product: ProductSummary }) {
  const tone =
    product.quantity === 0
      ? "text-danger"
      : product.lowStock
        ? "text-warning"
        : "text-success-text";
  const units = `${product.quantity} ${product.quantity === 1 ? "unit" : "units"}`;

  return <span className={cn("font-bold", tone)}>{units}</span>;
}

/**
 * The handoff draws a toggle switch in this column. A switch is a write, and this
 * table is read-only for a suspended salon (`TENANCY.md` §6), so the state is shown
 * as a badge and changed where every other field is — in the drawer.
 */
function StatusCell({ status }: { status: CatalogStatusValue }) {
  const isActive = status === "ACTIVE";

  return (
    <Badge variant={isActive ? "success" : "neutral"} dot>
      {isActive ? "Active" : "Inactive"}
    </Badge>
  );
}

/**
 * One tab's list: the count line, the table and the pager.
 *
 * Shared by both tabs because that chrome is identical — only the columns, the rows
 * and the noun differ — which keeps the page's own body down to what is specific to
 * screen 08.
 */
interface CataloguePanelProps<T extends { id: string }> {
  /** Singular noun for a row; pluralised for the copy. */
  noun: "product" | "service";
  /** Accessible name for the table and its pager. */
  caption: string;
  addLabel: string;
  columns: TableColumn<T>[];
  rows: T[];
  search: string;
  isReadOnly: boolean;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  total: number;
  page: number;
  pageCount: number;
  onAdd: () => void;
  onPageChange: (page: number) => void;
  onClearSearch: () => void;
}

function CataloguePanel<T extends { id: string }>({
  noun,
  caption,
  addLabel,
  columns,
  rows,
  search,
  isReadOnly,
  isPending,
  isFetching,
  isError,
  error,
  total,
  page,
  pageCount,
  onAdd,
  onPageChange,
  onClearSearch,
}: CataloguePanelProps<T>) {
  const plural = `${noun}s`;
  const icon = noun === "product" ? <Package /> : <Scissors />;

  return (
    <section
      aria-busy={isPending || isFetching}
      aria-label={caption}
      className="rounded-card border border-line bg-surface"
    >
      <div className="flex items-center justify-between border-b border-line-soft px-5 py-3.5">
        <p className="text-sm text-ink-muted">
          {isPending ? `Loading ${plural}…` : `${total} ${total === 1 ? noun : plural}`}
          {search ? ` matching “${search}”` : ""}
        </p>
      </div>

      {isPending ? (
        <div className="flex flex-col gap-3 p-5">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-9" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          title={`The ${plural} list could not be loaded`}
          description={getErrorMessage(error)}
          icon={icon}
          action={<Button onClick={() => window.location.reload()}>Try again</Button>}
        />
      ) : (
        <>
          <Table
            caption={caption}
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            className="rounded-none border-0"
            empty={
              search ? (
                <EmptyState
                  title={`No ${plural} match that search`}
                  description={`Nothing matches “${search}”. Try a different name.`}
                  icon={<Search />}
                  action={
                    <Button variant="secondary" onClick={onClearSearch}>
                      Clear search
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  title={`No ${plural} yet`}
                  description={
                    noun === "product"
                      ? "Add your first product to start tracking what is on the shelf."
                      : "Add a service so it can be booked and sold."
                  }
                  icon={icon}
                  action={
                    <Button onClick={onAdd} disabled={isReadOnly}>
                      {addLabel}
                    </Button>
                  }
                />
              )
            }
          />

          <div className="flex items-center justify-between gap-3 border-t border-line-soft px-5 py-3">
            <p className="text-xs text-ink-muted">
              Page {page} of {Math.max(pageCount, 1)}
            </p>
            <Pagination
              page={page}
              pageCount={pageCount}
              onPageChange={onPageChange}
              label={`${caption} pages`}
            />
          </div>
        </>
      )}
    </section>
  );
}
