/**
 * Entitlements — the module codes a tenant may use **right now**.
 *
 * `middleware/requireModule.ts` (the route guard) and the POS item search ask the
 * same question from opposite directions, which is why the answer is computed here
 * rather than inside either of them:
 *
 * - the guard **refuses** a route whose whole purpose is an add-on, with
 *   `403 MODULE_NOT_ENTITLED` and the code to buy;
 * - the item search **omits** a kind the salon has not bought, because there the
 *   add-on is one kind among five inside a core feature that must still work.
 *
 * The rule itself is the guard's: core modules pass as soon as the tenant exists, an
 * add-on needs a `TenantModule` row that is present and not past `expiresAt`. One
 * implementation is what stops the two callers disagreeing about a lapsed grant.
 *
 * Reads run in the tenant scope `middleware/auth.ts` opened, so the Prisma extension
 * filters `TenantModule` to the caller's salon (`Module` is platform data and is not
 * scoped). A *platform* scope would read every tenant's grants, which is why the
 * scope is asserted here rather than assumed — this helper is only ever right for
 * one salon at a time.
 */
import { prisma } from "./prisma.js";
import { currentScope } from "./tenant-context.js";

export interface ModuleEntitlements {
  /**
   * Every code in the module catalogue.
   *
   * `entitled` alone cannot tell a typo in a route's `requireModule` call from an
   * add-on the salon has not bought, and those two must fail differently: one is a
   * bug, the other is a bill.
   */
  known: ReadonlySet<string>;
  /** Codes the tenant may use now: core modules plus live add-on entitlements. */
  entitled: ReadonlySet<string>;
}

export async function moduleEntitlements(): Promise<ModuleEntitlements> {
  const scope = currentScope();

  if (scope?.kind !== "tenant") {
    throw new Error(
      "Entitlements are read inside a tenant scope, and this read ran without one. " +
        "Wrap it in `runAsTenant()`: a platform scope would read every tenant's grants.",
    );
  }

  const [modules, grants] = await Promise.all([
    prisma.module.findMany({ select: { code: true, isCore: true } }),
    prisma.tenantModule.findMany({
      select: { expiresAt: true, module: { select: { code: true } } },
    }),
  ]);

  const now = new Date();
  const entitled = new Set(modules.filter((module) => module.isCore).map((module) => module.code));

  for (const grant of grants) {
    // A row that has lapsed is refused even though it still exists, so the comparison
    // is against the current instant rather than against nullability. A `null`
    // `expiresAt` is an open-ended grant, not a missing one.
    if (grant.expiresAt === null || grant.expiresAt > now) entitled.add(grant.module.code);
  }

  return { known: new Set(modules.map((module) => module.code)), entitled };
}
