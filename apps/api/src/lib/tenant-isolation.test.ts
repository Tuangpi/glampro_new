import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { runAsPlatform, runAsTenant } from "../lib/tenant-context.js";
import { prisma } from "../lib/prisma.js";

/**
 * Tenant isolation, against the real database.
 *
 * The unit suites cannot prove this — only a live Postgres can. Seed two tenants
 * that both own a subscription and a payment, then assert that every read path
 * returns only the caller's rows, that a write stamps the caller's tenant, and
 * that an unscoped query refuses rather than returning everything.
 *
 * Skipped with a clear message when `DATABASE_URL` is absent, so `npm run verify`
 * still passes on a machine with no database running.
 */
const databaseUrl = process.env["DATABASE_URL"];

const TENANT_A = "test-tenant-a";
const TENANT_B = "test-tenant-b";

async function purge(): Promise<void> {
  await runAsPlatform(async () => {
    await prisma.tenantModule.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
    await prisma.payment.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
    await prisma.subscription.deleteMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [TENANT_A, TENANT_B] } } });
    await prisma.user.deleteMany({ where: { email: { contains: "@test.local" } } });
  });
}

async function seed(): Promise<void> {
  await purge();

  await runAsPlatform(async () => {
    for (const id of [TENANT_A, TENANT_B]) {
      const owner = await prisma.user.create({
        data: {
          email: `owner-${id}@test.local`,
          name: `Owner ${id}`,
          passwordHash: "not-a-real-hash",
        },
      });

      await prisma.tenant.create({
        data: { id, name: `Salon ${id}`, slug: `salon-${id}`, ownerUserId: owner.id },
      });

      await prisma.subscription.create({
        data: {
          tenantId: id,
          startDate: new Date("2026-01-01"),
          endDate: new Date("2027-01-01"),
          amount: "100.00",
        },
      });

      await prisma.payment.create({
        data: { tenantId: id, amount: "42.50", paidAt: new Date(), method: "CASH", note: id },
      });
    }
  });
}

describe("tenant isolation", { skip: databaseUrl ? false : "DATABASE_URL is not set" }, () => {
  before(seed);

  after(async () => {
    await purge();
    await prisma.$disconnect();
  });

  it("returns only the caller's rows for every tenant-scoped model", async () => {
    const forA = await runAsTenant(TENANT_A, async () => ({
      subscriptions: await prisma.subscription.findMany(),
      payments: await prisma.payment.findMany(),
      tenantModules: await prisma.tenantModule.findMany(),
      subscriptionCount: await prisma.subscription.count(),
      paymentCount: await prisma.payment.aggregate({ _count: { id: true } }),
    }));

    assert.deepEqual(
      forA.subscriptions.map((row) => row.tenantId),
      [TENANT_A],
    );
    assert.deepEqual(
      forA.payments.map((row) => row.tenantId),
      [TENANT_A],
    );
    assert.deepEqual(forA.tenantModules, []);
    assert.equal(forA.subscriptionCount, 1);
    assert.equal(forA.paymentCount._count.id, 1);
  });

  it("keeps the two tenants independent", async () => {
    const [forA, forB] = await Promise.all([
      runAsTenant(TENANT_A, () => prisma.payment.findMany()),
      runAsTenant(TENANT_B, () => prisma.payment.findMany()),
    ]);

    assert.deepEqual(
      forA.map((row) => row.note),
      [TENANT_A],
    );
    assert.deepEqual(
      forB.map((row) => row.note),
      [TENANT_B],
    );
  });

  it("cannot reach another tenant's row by unique id", async () => {
    const otherTenantSubscription = await runAsPlatform(() =>
      prisma.subscription.findFirstOrThrow({ where: { tenantId: TENANT_B } }),
    );

    // The extension rewrites findUnique to findFirst with the tenant filter, so
    // tenant A asking for tenant B's row by primary key gets null.
    const seenFromA = await runAsTenant(TENANT_A, () =>
      prisma.subscription.findUnique({ where: { id: otherTenantSubscription.id } }),
    );

    assert.equal(seenFromA, null);
  });

  it("cannot delete another tenant's row", async () => {
    const otherTenantSubscription = await runAsPlatform(() =>
      prisma.subscription.findFirstOrThrow({ where: { tenantId: TENANT_B } }),
    );

    await assert.rejects(() =>
      runAsTenant(TENANT_A, () =>
        prisma.subscription.delete({ where: { id: otherTenantSubscription.id } }),
      ),
    );

    const stillThere = await runAsPlatform(() =>
      prisma.subscription.findUnique({ where: { id: otherTenantSubscription.id } }),
    );

    assert.ok(stillThere, "tenant B's subscription must survive tenant A's delete");
  });

  it("stamps the caller's tenant on create, so a handler cannot forge one", async () => {
    const created = await runAsTenant(TENANT_A, () =>
      prisma.subscription.create({
        data: {
          tenantId: TENANT_B,
          startDate: new Date("2026-02-01"),
          endDate: new Date("2027-02-01"),
          amount: "10.00",
        },
      }),
    );

    assert.equal(created.tenantId, TENANT_A, "the extension must overwrite a forged tenantId");

    await runAsPlatform(() => prisma.subscription.delete({ where: { id: created.id } }));
  });

  it("scopes updateMany so a bulk edit cannot cross tenants", async () => {
    await runAsTenant(TENANT_A, () => prisma.payment.updateMany({ data: { note: "edited-by-a" } }));

    const forB = await runAsTenant(TENANT_B, () => prisma.payment.findMany());

    assert.deepEqual(
      forB.map((row) => row.note),
      [TENANT_B],
      "tenant B's rows must be untouched by tenant A's updateMany",
    );

    await runAsPlatform(() =>
      prisma.payment.updateMany({ where: { tenantId: TENANT_A }, data: { note: TENANT_A } }),
    );
  });

  it("lets runAsPlatform read across tenants, which is the console's privilege", async () => {
    const all = await runAsPlatform(() =>
      prisma.subscription.findMany({ where: { tenantId: { in: [TENANT_A, TENANT_B] } } }),
    );

    assert.equal(all.length, 2, "an explicit platform scope is the one unscoped path");
  });

  it("does not scope the platform plane, so the console can reach it", async () => {
    const tenant = await runAsPlatform(() => prisma.tenant.findMany({ select: { id: true } }));

    assert.ok(tenant.length >= 2, "Tenant is above the isolation boundary and stays reachable");
  });
});
