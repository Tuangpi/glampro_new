/**
 * Centralised TanStack Query keys.
 *
 * Every query and every `invalidateQueries` call must use these factories so
 * cache invalidation matches by prefix and never silently misses.
 *
 * Conventions:
 *   - list keys are `["domain", "list"]`; the pagination/filter object is
 *     appended by the caller as the final element.
 *   - detail keys embed the id: `["domain", "detail", id]`.
 */
export const queryKeys = {
  health: {
    status: () => ["health", "status"] as const,
  },

  auth: {
    profile: () => ["auth", "profile"] as const,
  },

  dashboard: {
    summary: () => ["dashboard", "summary"] as const,
  },

  /**
   * The till. `openCart` is the odd one: the cart is client state kept in the
   * cache (`useSaleCart` in `hooks/useSale.ts`), so the rail badge and the
   * till read one cart, and signing out clears it.
   *
   * The search and customer lookups follow the convention above — the base
   * tuple here, the filter object appended by the caller — so one prefix
   * invalidates every search and every kind after a sale rings up.
   */
  sale: {
    items: () => ["sale", "items"] as const,
    openCart: () => ["sale", "openCart"] as const,
    customers: () => ["sale", "customers"] as const,
  },

  appointments: {
    list: () => ["appointments", "list"] as const,
    detail: (id: string) => ["appointments", "detail", id] as const,
    calendar: (from: string, to: string) => ["appointments", "calendar", from, to] as const,
  },

  customers: {
    list: () => ["customers", "list"] as const,
    detail: (id: string) => ["customers", "detail", id] as const,
  },

  /**
   * Branches. Not paginated and not filtered, so there is one key: a picker has no
   * page 2 and no search box, and every caller wants the same whole list.
   */
  departments: {
    list: () => ["departments", "list"] as const,
  },

  products: {
    list: () => ["products", "list"] as const,
    detail: (id: string) => ["products", "detail", id] as const,
    /**
     * Server-side aggregates — the stat tiles and the rail badge read `total`. The
     * filter object is appended by the caller, so the Low-stock tile and the badge
     * (both `{ lowStock: true }`) share one entry.
     */
    count: () => ["products", "count"] as const,
  },

  services: {
    list: () => ["services", "list"] as const,
    detail: (id: string) => ["services", "detail", id] as const,
    /** The services half of the screen's "Total items" tile. */
    count: () => ["services", "count"] as const,
  },

  /**
   * Screen 08's third and fourth tabs.
   *
   * There is no `count` key for either, and that is deliberate: `packages` and
   * `giftCards` are **add-on** modules, so the screen's stat tiles — which describe
   * the shelf every salon has — must not report a number that a salon without the
   * add-on could not have.
   */
  packages: {
    list: () => ["packages", "list"] as const,
    detail: (id: string) => ["packages", "detail", id] as const,
  },

  giftCards: {
    list: () => ["giftCards", "list"] as const,
    detail: (id: string) => ["giftCards", "detail", id] as const,
  },

  staff: {
    list: () => ["staff", "list"] as const,
    detail: (id: string) => ["staff", "detail", id] as const,
    /**
     * Server-side aggregates for the screen's stat tiles, the same shape as the
     * catalogue's `count` key: the filter object is appended by the caller, so the
     * Active tile and the Disabled tile ask two questions and cache two answers.
     */
    count: () => ["staff", "count"] as const,
  },

  reports: {
    sales: (range: string) => ["reports", "sales", range] as const,
    staff: (range: string) => ["reports", "staff", range] as const,
    inventory: (range: string) => ["reports", "inventory", range] as const,
  },

  settings: {
    general: () => ["settings", "general"] as const,
    /** The module catalogue joined to this salon's grants (screen 11's panel). */
    modules: () => ["settings", "modules"] as const,
    businessHours: () => ["settings", "businessHours"] as const,
    users: () => ["settings", "users"] as const,
  },
} as const;
