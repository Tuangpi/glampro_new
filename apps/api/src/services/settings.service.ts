/**
 * Settings — handoff screen 11, `/api/settings`.
 *
 * Two reads and one write. The profile read names the tenant from the ambient
 * scope rather than from the request — `Tenant` is deliberately **not** in
 * `TENANT_SCOPED_MODELS` (it *is* the scope), so there is no argument to forge
 * and no header to spoof (AGENTS.md rule 1). The modules read joins the
 * platform catalogue to this salon's grants using the **same rule
 * `requireModule` enforces**, so the panel and the routes can never disagree
 * about a lapsed grant — it is a read of the boundary, not a second
 * implementation of it.
 */
import { moduleSummarySchema, salonProfileSchema } from "@glampro/shared";
import type { ModuleSummary, SalonProfile, UpdateSalonProfileInput } from "@glampro/shared";

import { notFound } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { currentScope } from "../lib/tenant-context.js";

/**
 * The caller's tenant id, or an exception.
 *
 * Thrown rather than defaulted: a settings read without a scope would read the
 * wrong salon's profile, and "which tenant" is never a question this file asks
 * the request (AGENTS.md rule 1, `docs/saas/TENANCY.md`).
 */
function requireTenantId(): string {
  const scope = currentScope();
  if (scope?.kind !== "tenant") {
    throw new Error(
      "Settings are read inside a tenant scope, and this call ran without one. " +
        "Wrap it in `runAsTenant()`.",
    );
  }
  return scope.tenantId;
}

/** `GET /api/settings/profile` */
export async function getSalonProfile(): Promise<SalonProfile> {
  const tenantId = requireTenantId();

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      lowStockThreshold: true,
      createdAt: true,
      updatedAt: true,
      owner: { select: { id: true, name: true, email: true } },
    },
  });
  // Unreachable while `users.tenantId` is the foreign key we authenticated
  // through — but a null here would render an empty profile rather than a
  // wrong one, so it says so instead.
  if (!tenant) throw notFound("This salon's record could not be found.", "TENANT_NOT_FOUND");

  return salonProfileSchema.parse({
    ...tenant,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString(),
  });
}

/**
 * `PATCH /api/settings/profile` — the salon's own two fields.
 *
 * `slug` and `status` are not accepted at all (the schema is `.strict()`): the
 * first is the isolation key's public face and the second is the platform
 * console's verdict, so neither is the salon's to write. The route adds
 * `requireRole` and `requireWritableTenant()` on top — this service trusts the
 * boundary, it does not re-implement it.
 */
export async function updateSalonProfile(input: UpdateSalonProfileInput): Promise<SalonProfile> {
  const tenantId = requireTenantId();

  await prisma.tenant.update({ where: { id: tenantId }, data: { ...input } });
  return getSalonProfile();
}

/**
 * `GET /api/settings/modules` — the catalogue joined to this salon's grants.
 *
 * `Module` is platform data and unscoped on purpose; the grants are read in the
 * tenant scope, so this answers for exactly one salon. The `entitled` rule is
 * `moduleEntitlements()`' own: core passes as soon as the tenant exists, an
 * add-on needs a live `TenantModule` row (present, and not past `expiresAt`).
 */
export async function listModules(): Promise<ModuleSummary[]> {
  requireTenantId();

  const [modules, grants] = await Promise.all([
    prisma.module.findMany({
      select: { code: true, name: true, category: true, isCore: true, sortOrder: true },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    }),
    prisma.tenantModule.findMany({
      select: { expiresAt: true, module: { select: { code: true } } },
    }),
  ]);

  const grantByCode = new Map(grants.map((grant) => [grant.module.code, grant.expiresAt] as const));
  const now = new Date();

  return modules.map((module) => {
    const granted = grantByCode.has(module.code);
    const expiry = grantByCode.get(module.code) ?? null;
    // The rule `moduleEntitlements()` runs: core passes on its own, an add-on
    // needs a row that is present and not past its `expiresAt`. `granted` is
    // tracked apart from `expiry` because "no grant" and "open-ended grant"
    // are both a `null` instant but only one of them is entitled.
    const entitled =
      module.isCore || (granted && (expiry === null || expiry.getTime() > now.getTime()));

    return moduleSummarySchema.parse({
      code: module.code,
      name: module.name,
      category: module.category,
      isCore: module.isCore,
      entitled,
      expiresAt: granted && expiry !== null ? expiry.toISOString() : null,
    });
  });
}
