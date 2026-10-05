/**
 * The package service, against the real database.
 *
 * Two things here can only be shown against a real database and real scoping:
 *
 * - **A bundle may only cover this salon's services.** `PackageService` is a link
 *   row, and a forged service id would otherwise become a cross-tenant link that no
 *   tenant-scoped read would ever notice. The refusal and the *absence of the link*
 *   are both asserted, because a 422 that still wrote the row would pass a test that
 *   only checked the error.
 * - **`serviceCount` and the covered services are the same array**, so the table's
 *   column and the editor's checkbox list cannot disagree — the reason
 *   `PACKAGE_SELECT` reads the relation instead of counting it separately.
 *
 * Skipped with a clear message when `DATABASE_URL` is absent, so `npm run verify`
 * still passes on a machine with no database running.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { HttpError } from "../lib/http-error.js";
import { runAsPlatform, runAsTenant } from "../lib/tenant-context.js";
import { prisma } from "../lib/prisma.js";
import { createPackage, getPackage, listPackages, updatePackage } from "./package.service.js";

const databaseUrl = process.env["DATABASE_URL"];

const TENANT_A = "package-test-a";
const TENANT_B = "package-test-b";

/** No filters — the list contract makes every one of them optional. */
const NO_FILTERS = {
  page: 1,
  pageSize: 20,
  search: undefined,
  status: undefined,
  departmentId: undefined,
  lowStock: undefined,
  threshold: undefined,
} as const;

async function purge(): Promise<void> {
  await runAsPlatform(async () => {
    const ids = [TENANT_A, TENANT_B];
    await prisma.packageService.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.package.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.service.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
  });
}

/**
 * Two salons, each with three services and two bundles: `Aloha Bundle` covers two
 * services and holds ten sessions, `Bahar Bundle` is retired and covers nothing —
 * the migrated shape, since legacy `no_of_time` defaulted to zero.
 */
async function seed(): Promise<void> {
  await purge();

  await runAsPlatform(async () => {
    for (const id of [TENANT_A, TENANT_B]) {
      await prisma.tenant.create({
        data: { id, name: `Salon ${id}`, slug: `salon-${id}` },
      });

      for (const name of ["Cut", "Colour", "Blow-dry"]) {
        await prisma.service.create({
          data: {
            tenantId: id,
            name: `${name} ${id}`,
            memberPrice: "30.00",
            nonmemberPrice: "35.00",
          },
        });
      }

      const services = await prisma.service.findMany({
        where: { tenantId: id },
        select: { id: true },
        orderBy: { name: "asc" },
      });

      const aloha = await prisma.package.create({
        data: {
          tenantId: id,
          name: `Aloha Bundle ${id}`,
          sessionCount: 10,
          memberPrice: "250.00",
          nonmemberPrice: "300.00",
          description: "Ten sessions of anything",
        },
      });

      // The two services the bundle covers, linked the way `createPackage` links them.
      await prisma.packageService.createMany({
        data: services.slice(0, 2).map((service) => ({
          tenantId: id,
          packageId: aloha.id,
          serviceId: service.id,
        })),
      });

      await prisma.package.create({
        data: {
          tenantId: id,
          name: `Bahar Bundle ${id}`,
          sessionCount: 0,
          memberPrice: "0.00",
          nonmemberPrice: "0.00",
          status: "INACTIVE",
        },
      });
    }
  });
}

/** A package id read unscoped, for the cross-tenant and link-count assertions. */
function packageIdOf(tenantId: string, name: string): Promise<string> {
  return runAsPlatform(async () => {
    const bundle = await prisma.package.findFirstOrThrow({
      where: { tenantId, name: `${name} Bundle ${tenantId}` },
      select: { id: true },
    });
    return bundle.id;
  });
}

/** A service id read unscoped, so a test can hand tenant A a tenant B service. */
function serviceIdOf(tenantId: string, name: string): Promise<string> {
  return runAsPlatform(async () => {
    const service = await prisma.service.findFirstOrThrow({
      where: { tenantId, name: `${name} ${tenantId}` },
      select: { id: true },
    });
    return service.id;
  });
}

/** How many services a bundle covers, counted unscoped. */
function linkCount(packageId: string): Promise<number> {
  return runAsPlatform(() => prisma.packageService.count({ where: { packageId } }));
}

describe(
  "package.service, against the database",
  { skip: databaseUrl ? false : "DATABASE_URL is not set" },
  () => {
    before(seed);
    after(purge);

    it("lists only the calling tenant's bundles, ordered by name", async () => {
      const page = await runAsTenant(TENANT_A, () => listPackages(NO_FILTERS));

      assert.equal(page.total, 2);
      assert.deepEqual(
        page.data.map((row) => row.name),
        [`Aloha Bundle ${TENANT_A}`, `Bahar Bundle ${TENANT_A}`],
      );
    });

    it("carries no stock, because a bundle is not a shelf item", async () => {
      const page = await runAsTenant(TENANT_A, () => listPackages(NO_FILTERS));

      for (const row of page.data) {
        assert.equal("quantity" in row, false);
        assert.equal("lowStock" in row, false);
      }
    });

    it("counts the services a bundle covers, and returns them on the detail read", async () => {
      const page = await runAsTenant(TENANT_A, () => listPackages(NO_FILTERS));
      const aloha = page.data.find((row) => row.name.startsWith("Aloha"));
      assert.ok(aloha, "the seeded bundle must be found");

      assert.equal(aloha.serviceCount, 2);
      assert.equal(aloha.sessionCount, 10);

      const detail = await runAsTenant(TENANT_A, () => getPackage(aloha.id));
      assert.deepEqual(
        detail.services.map((service) => service.name),
        [`Blow-dry ${TENANT_A}`, `Colour ${TENANT_A}`],
      );
      // The column and the list are the same array, so the two cannot disagree.
      assert.equal(detail.services.length, detail.serviceCount);
    });

    it("keeps a zero-session migrated bundle readable", async () => {
      const page = await runAsTenant(TENANT_A, () =>
        listPackages({ ...NO_FILTERS, search: "Bahar" }),
      );
      const bahar = page.data[0];
      assert.ok(bahar, "the retired bundle must still be listed");

      // Legacy `no_of_time` defaulted to zero, so zero is a real migrated value and
      // must survive a read rather than being defaulted to one session.
      assert.equal(bahar.sessionCount, 0);
      assert.equal(bahar.serviceCount, 0);
      assert.equal(bahar.status, "INACTIVE");
    });

    it("matches the search against the description as well as the name", async () => {
      const page = await runAsTenant(TENANT_A, () =>
        listPackages({ ...NO_FILTERS, search: "sessions of anything" }),
      );

      assert.equal(page.total, 1);
      assert.equal(page.data[0]?.name, `Aloha Bundle ${TENANT_A}`);
    });

    it("cannot read another tenant's bundle by id", async () => {
      const foreign = await packageIdOf(TENANT_B, "Aloha");

      await assert.rejects(
        runAsTenant(TENANT_A, () => getPackage(foreign)),
        /does not exist/,
      );
    });

    it("creates a bundle that covers nothing when no services are named", async () => {
      const created = await runAsTenant(TENANT_A, () =>
        createPackage({
          name: "Charlie Bundle",
          sessionCount: 5,
          memberPrice: 100,
          nonmemberPrice: 120,
        }),
      );

      assert.equal(created.memberPrice, "100.00");
      assert.equal(created.sessionCount, 5);
      assert.equal(created.serviceCount, 0);
      assert.deepEqual(created.services, []);
      assert.equal(created.status, "ACTIVE");
    });

    it("refuses a service from another salon, and writes nothing for it", async () => {
      const foreign = await serviceIdOf(TENANT_B, "Cut");

      // Asserted on the *details* rather than the message: `validationFailed`
      // answers "Validation failed" at the top and names the field below, which is
      // what the package form puts on the service picker.
      await assert.rejects(
        runAsTenant(TENANT_A, () =>
          createPackage({
            name: "Smuggler Bundle",
            sessionCount: 3,
            memberPrice: 50,
            nonmemberPrice: 60,
            serviceIds: [foreign],
          }),
        ),
        (error: unknown) => {
          assert.ok(error instanceof HttpError, "the refusal must be an HttpError");
          assert.equal(error.statusCode, 422);
          assert.deepEqual(error.details, [
            {
              path: "body.serviceIds",
              message: "One or more selected services do not exist.",
            },
          ]);
          return true;
        },
      );

      // Why the refusal is checked *before* the insert rather than after it: this
      // assertion is what proves the order.
      const smuggled = await runAsPlatform(() =>
        prisma.package.findFirst({ where: { name: "Smuggler Bundle" }, select: { id: true } }),
      );
      assert.equal(smuggled, null, "a refused create must not leave a bundle behind");
    });

    it("links the services it is given, collapsing duplicates", async () => {
      const cut = await serviceIdOf(TENANT_A, "Cut");
      const colour = await serviceIdOf(TENANT_A, "Colour");

      const created = await runAsTenant(TENANT_A, () =>
        createPackage({
          name: "Delta Bundle",
          sessionCount: 4,
          memberPrice: 90,
          nonmemberPrice: 110,
          // Twice, because a double tick in the form is not a 500.
          serviceIds: [cut, colour, cut],
        }),
      );

      assert.equal(created.serviceCount, 2);
      assert.equal(await linkCount(created.id), 2);
    });

    it("leaves the covered services alone when a patch does not mention them", async () => {
      const aloha = await packageIdOf(TENANT_A, "Aloha");

      const updated = await runAsTenant(TENANT_A, () => updatePackage(aloha, { sessionCount: 12 }));

      assert.equal(updated.sessionCount, 12);
      assert.equal(updated.serviceCount, 2, "absent means unchanged, not empty");
      assert.equal(await linkCount(aloha), 2);
    });

    it("empties the covered services when a patch sends an empty array", async () => {
      const aloha = await packageIdOf(TENANT_A, "Aloha");

      const updated = await runAsTenant(TENANT_A, () => updatePackage(aloha, { serviceIds: [] }));

      assert.equal(updated.serviceCount, 0);
      assert.equal(await linkCount(aloha), 0);
    });

    it("cannot update another tenant's bundle", async () => {
      const foreign = await packageIdOf(TENANT_B, "Aloha");

      await assert.rejects(
        runAsTenant(TENANT_A, () => updatePackage(foreign, { sessionCount: 99 })),
        /does not exist/,
      );
    });
  },
);
