import type { NextFunction, Request, RequestHandler, Response } from "express";

import { moduleEntitlements } from "../lib/entitlements.js";
import { forbidden, unauthorized } from "../lib/http-error.js";
import { currentScope } from "../lib/tenant-context.js";

/**
 * Entitlement guard — layer 3 of the four in `docs/saas/TENANCY.md` §1.
 *
 * Core modules (`Module.isCore`) pass as soon as the tenant exists. Add-ons need
 * an effective `TenantModule` row: present, and not past `expiresAt`. A row that
 * has lapsed is refused even though it still exists, which is why the comparison
 * is against the current instant rather than against nullability.
 *
 * Runs after `auth`. Refusal is `403` with `code: "MODULE_NOT_ENTITLED"` and the
 * module code in `details`, so the UI can render "this needs the Packages add-on"
 * rather than a bare "forbidden".
 *
 * The rule and the two reads live in `lib/entitlements.ts`, because the POS item
 * search needs the same answer for a different reason — it omits a kind the salon has
 * not bought instead of refusing the request. Both entitlement queries are scoped by
 * the Prisma extension, so neither can read another tenant's `TenantModule` even if
 * the tenant filter were dropped here by mistake.
 */
export function requireModule(code: string): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      next(unauthorized());
      return;
    }

    const scope = currentScope();

    // No tenant scope means this route was reached outside a tenant request. The
    // console reads platform-plane models only (see TENANCY.md §7), so there is
    // no entitlement of a tenant's to check on that path.
    if (scope?.kind !== "tenant") {
      next(forbidden("This route requires a tenant context.", "TENANT_CONTEXT_REQUIRED"));
      return;
    }

    try {
      const { known, entitled } = await moduleEntitlements();

      if (!known.has(code)) {
        // A typo in a route's module code must fail loudly rather than quietly
        // granting access, so this is a refusal and not a pass. It is a different
        // refusal from "your salon has not bought this", which is why `known` is
        // returned alongside `entitled`.
        next(forbidden(`Unknown module "${code}".`, "MODULE_UNKNOWN"));
        return;
      }

      if (!entitled.has(code)) {
        next(
          forbidden(`This feature needs the "${code}" add-on.`, "MODULE_NOT_ENTITLED", {
            module: code,
          }),
        );
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
