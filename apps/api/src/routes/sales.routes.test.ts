import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

/**
 * Integration tests for the POS item search mount — the first half of screens 01–02.
 *
 * The assertion that matters most is the **opposite** of the one
 * `packages.routes.test.ts` makes. There, an add-on the salon has not bought must
 * refuse the route. Here the add-on is one kind among five inside a core feature, so
 * the request must still succeed — with a shorter list and a `searchableKinds` that
 * says which tabs exist. A test that only checked the happy path would pass with the
 * entitlement check deleted, and one that only checked a refusal would pass with the
 * whole feature 403ing.
 *
 * Entitlement is read per request rather than baked into the token, which is why the
 * same access token sees a new tab after the `TenantModule` row is created — asserted
 * here, because a cashier must not have to sign out to sell a bundle they just bought.
 *
 * Gated on `DATABASE_URL`, like the other integration suites: it creates two salons,
 * signs in for real, and removes everything it made.
 */
const databaseUrl = process.env["DATABASE_URL"];
process.env.DATABASE_URL ??= "postgresql://glampro:glampro@127.0.0.1:5432/glampro_test";
process.env.JWT_SECRET ??= "sales-items-routes-test-secret";
process.env.NODE_ENV = "test";

const { createApp } = await import("../app.js");
const { prisma } = await import("../lib/prisma.js");
const { runAsPlatform } = await import("../lib/tenant-context.js");
const { hashPassword } = await import("../lib/password.js");
const { CORE_MODULE_CODES, MODULE_CODES } = await import("@glampro/shared");

const PASSWORD = "correct-horse-1";
const DOMAIN = "sales-items-rt.test";
const EMAIL = `owner@${DOMAIN}`;

const TENANT_A = "sales-items-a";
const TENANT_B = "sales-items-b";
const TENANT_IDS = [TENANT_A, TENANT_B];

/** Removes everything this file created, so runs are repeatable. */
async function purge(): Promise<void> {
  await runAsPlatform(async () => {
    await prisma.tenantModule.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.package.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.valuePackage.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.giftCard.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.product.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.service.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: `@${DOMAIN}` } } });
    await prisma.tenant.deleteMany({ where: { id: { in: TENANT_IDS } } });
  });
}

/**
 * Two salons, one owner in A, and no add-ons for either.
 *
 * The module catalogue is upserted the way the real seed does it — `isCore` derived
 * from the shared constant and the same list the guard reads — so a missing `sales`
 * row cannot make this suite pass for the wrong reason (`MODULE_UNKNOWN`).
 */
async function seed(): Promise<void> {
  const passwordHash = await hashPassword(PASSWORD);

  await runAsPlatform(async () => {
    for (const [index, code] of MODULE_CODES.entries()) {
      const isCore = (CORE_MODULE_CODES as readonly string[]).includes(code);
      await prisma.module.upsert({
        where: { code },
        update: { isCore },
        create: {
          code,
          name: code,
          category: isCore ? "Core" : "Add-on",
          isCore,
          sortOrder: index,
        },
      });
    }

    await prisma.tenant.create({ data: { id: TENANT_A, name: "Sales Items A", slug: TENANT_A } });
    await prisma.tenant.create({ data: { id: TENANT_B, name: "Sales Items B", slug: TENANT_B } });

    await prisma.user.create({
      data: {
        tenantId: TENANT_A,
        email: EMAIL,
        name: "Ola Owner",
        passwordHash,
        globalRole: "SUPER_ADMIN",
      },
    });

    // A's catalogue: one of everything, so each tab has something to be missing.
    await prisma.service.create({
      data: {
        tenantId: TENANT_A,
        name: "Aloha Cut",
        memberPrice: "40.00",
        nonmemberPrice: "50.00",
        points: 5,
      },
    });
    await prisma.product.create({
      data: {
        tenantId: TENANT_A,
        name: "Aloha Shampoo",
        memberPrice: "12.50",
        nonmemberPrice: "15.00",
        quantity: 3,
      },
    });
    await prisma.package.create({
      data: {
        tenantId: TENANT_A,
        name: "Aloha Bundle",
        sessionCount: 10,
        memberPrice: "250.00",
        nonmemberPrice: "300.00",
      },
    });
    await prisma.valuePackage.create({
      data: {
        tenantId: TENANT_A,
        name: "Aloha Credit",
        price: "100.00",
        credit: "120.00",
      },
    });
    await prisma.giftCard.create({
      data: { tenantId: TENANT_A, name: "Aloha Card", value: "150.00" },
    });

    // B's, with a name no search in this file will match, so a leak is unmistakable.
    await prisma.service.create({
      data: {
        tenantId: TENANT_B,
        name: "Foreign Cut",
        memberPrice: "10.00",
        nonmemberPrice: "12.00",
      },
    });
  });
}

/** Grants or revokes an add-on for tenant A. `Module` rows are platform data. */
async function setEntitlement(code: string, entitled: boolean): Promise<void> {
  await runAsPlatform(async () => {
    const module = await prisma.module.findUniqueOrThrow({
      where: { code },
      select: { id: true },
    });

    if (entitled) {
      await prisma.tenantModule.upsert({
        where: { tenantId_moduleId: { tenantId: TENANT_A, moduleId: module.id } },
        update: { expiresAt: null },
        create: { tenantId: TENANT_A, moduleId: module.id },
      });
      return;
    }

    await prisma.tenantModule.deleteMany({ where: { tenantId: TENANT_A, moduleId: module.id } });
  });
}

interface Envelope {
  data?: unknown;
  statusCode?: number;
  message?: string;
  code?: string;
  details?: { path?: string }[];
}

/** The item search's payload, as much of it as these tests read. */
interface SearchBody {
  searchableKinds: string[];
  items: { kind: string; name: string; price: string; memberPrice: string | null }[];
}

async function envelope(response: Response): Promise<Envelope> {
  return (await response.json()) as Envelope;
}

async function dataOf<T>(response: Response): Promise<T> {
  const body = await envelope(response);
  assert.ok(body.data !== undefined, `expected a data envelope, got ${JSON.stringify(body)}`);
  return body.data as T;
}

let baseUrl = "";
let server: Server | undefined;

async function request(method: "GET", path: string, accessToken?: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
  });
}

describe(
  "sales item search endpoint",
  { skip: databaseUrl ? false : "DATABASE_URL is not set" },
  () => {
    let token = "";

    before(async () => {
      await purge();
      await seed();

      await new Promise<void>((resolve) => {
        server = createApp().listen(0, "127.0.0.1", () => resolve());
      });
      baseUrl = `http://127.0.0.1:${(server?.address() as AddressInfo).port}`;

      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
      });
      assert.equal(response.status, 200, "could not sign in as the owner");
      token = (await dataOf<{ accessToken: string }>(response)).accessToken;
    });

    after(async () => {
      await new Promise<void>((resolve, reject) => {
        if (!server) {
          resolve();
          return;
        }
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await purge();
    });

    it("mounts the search behind auth", async () => {
      // A 401 rather than a 404 is what proves the mount exists at all.
      const response = await request("GET", "/api/sales/items");
      assert.equal(response.status, 401);
    });

    it("answers with the kinds a salon that has bought nothing may sell", async () => {
      await setEntitlement("packages", false);
      await setEntitlement("giftCards", false);

      const response = await request("GET", "/api/sales/items", token);
      assert.equal(response.status, 200);

      const body = await dataOf<SearchBody>(response);
      assert.deepEqual(body.searchableKinds, ["SERVICE", "PRODUCT"]);
      // Sorted by name, so the two sellable rows come back service-first even though it
      // is the products this salon has more of.
      assert.deepEqual(
        body.items.map((item) => item.name),
        ["Aloha Cut", "Aloha Shampoo"],
        "the two sellable rows this salon has, out of five it owns",
      );
    });

    it("shows a new tab on the same token once the add-on is granted", async () => {
      await setEntitlement("packages", true);

      const body = await dataOf<SearchBody>(await request("GET", "/api/sales/items", token));
      assert.deepEqual(body.searchableKinds, ["SERVICE", "PRODUCT", "PACKAGE", "VALUE_PACKAGE"]);
      assert.ok(body.items.some((item) => item.kind === "PACKAGE"));

      // Granting one add-on must not unlock the other.
      assert.equal(body.searchableKinds.includes("GIFT_CARD"), false);
    });

    it("rejects an unknown kind rather than quietly searching everything", async () => {
      const response = await request("GET", "/api/sales/items?kind=MEMBERSHIP", token);
      const body = await envelope(response);

      assert.equal(response.status, 422);
      assert.equal(body.code, "VALIDATION_FAILED");
      // The browser puts a 422's `path` on the control that caused it, so the path is
      // part of the contract rather than an implementation detail.
      assert.ok(
        body.details?.some((detail) => detail.path === "query.kind"),
        `expected a detail for query.kind, got ${JSON.stringify(body.details)}`,
      );
    });

    it("rejects a limit above the ceiling instead of clamping it silently", async () => {
      const response = await request("GET", "/api/sales/items?limit=999", token);

      assert.equal(response.status, 422);
      assert.equal((await envelope(response)).code, "VALIDATION_FAILED");
    });

    it("caps each kind, not the list", async () => {
      const body = await dataOf<SearchBody>(
        await request("GET", "/api/sales/items?limit=1", token),
      );

      // One row per searchable kind and nothing else. Compared sorted, because the list
      // is ordered by name rather than by kind — and stated without naming the kind list,
      // so the assertion holds whatever has been granted above it.
      assert.deepEqual(
        body.items.map((item) => item.kind).sort(),
        [...body.searchableKinds].sort(),
      );
    });

    it("searches by name and narrows by an add-on kind", async () => {
      const body = await dataOf<SearchBody>(
        await request("GET", "/api/sales/items?search=aloha&kind=PACKAGE", token),
      );

      assert.deepEqual(
        body.items.map((item) => item.name),
        ["Aloha Bundle"],
      );
      // Money is a string on the wire: the non-member price, formatted, not a float.
      assert.equal(body.items[0]?.price, "300.00");
      assert.equal(body.items[0]?.memberPrice, "250.00");
    });

    it("answers a kind whose add-on is missing with nothing, not with a refusal", async () => {
      await setEntitlement("giftCards", false);

      const response = await request("GET", "/api/sales/items?kind=GIFT_CARD", token);
      const body = await dataOf<SearchBody>(response);

      // A 200 with no rows: the picker was drawn from a core feature, and "you have not
      // bought this" is said by `searchableKinds`, not by failing the request.
      assert.equal(response.status, 200);
      assert.deepEqual(body.items, []);
      assert.equal(body.searchableKinds.includes("GIFT_CARD"), false);
    });

    it("never returns another salon's rows", async () => {
      const body = await dataOf<SearchBody>(await request("GET", "/api/sales/items", token));

      assert.ok(body.items.length > 0);
      assert.equal(
        body.items.some((item) => item.name === "Foreign Cut"),
        false,
        "tenant B's service must never appear in tenant A's till",
      );
    });
  },
);
