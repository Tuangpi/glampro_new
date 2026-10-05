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

  sale: {
    items: (search?: string) => ["sale", "items", { search: search ?? "" }] as const,
    openCart: () => ["sale", "openCart"] as const,
    customers: (search?: string) => ["sale", "customers", { search: search ?? "" }] as const,
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
    businessHours: () => ["settings", "businessHours"] as const,
    users: () => ["settings", "users"] as const,
  },
} as const;
