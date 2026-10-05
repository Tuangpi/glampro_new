/**
 * Public surface of `@glampro/shared`.
 *
 * Consumers import from the package root (`@glampro/shared`) so the internal
 * file layout can change without touching every call site.
 */
export * from "./constants.js";
export * from "./types.js";
export * from "./schemas/auth.js";
export * from "./schemas/common.js";
export * from "./schemas/customer.js";
export * from "./schemas/catalogue.js";
export * from "./schemas/sales.js";
export * from "./schemas/staff.js";
