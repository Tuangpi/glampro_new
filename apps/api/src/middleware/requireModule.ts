import type { NextFunction, Request, RequestHandler, Response } from "express";

import { forbidden, unauthorized } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
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
 * Both entitlement queries are scoped by the Prisma extension, so this cannot
 * read another tenant's `TenantModule` even if the tenant filter were dropped
 * here by mistake.
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
      const module = await prisma.module.findUnique({
        where: { code },
        select: { id: true, isCore: true },
      });

      if (!module) {
        // A typo in a route's module code must fail loudly rather than quietly
        // granting access, so this is a refusal and not a pass.
        next(forbidden(`Unknown module "${code}".`, "MODULE_UNKNOWN"));
        return;
      }

      if (module.isCore) {
        next();
        return;
      }

      const entitlement = await prisma.tenantModule.findFirst({
        where: { moduleId: module.id },
        select: { expiresAt: true },
      });

      const isEffective =
        entitlement !== null &&
        (entitlement.expiresAt === null || entitlement.expiresAt > new Date());

      if (!isEffective) {
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
