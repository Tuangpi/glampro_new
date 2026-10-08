// Static, so the `DATABASE_URL` gate below reads `.env` instead of skipping silently
// (the reason the suite used to vanish from `npm run verify` — see `auth.routes.test.ts`).
import "dotenv/config";

import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

/**
 * Integration tests for the sales mount — screens 01–02 end to end: the item search
 * a cashier types into **before** anything is in the cart (5b.1), and the write that
 * rings that cart up plus the receipt it answers with (5b.2).
 *
 * For the search, the assertion that matters most is the **opposite** of the one
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

/** The receipt — `POST /api/sales` and `GET /api/sales/:id` answer with the same one. */
interface ReceiptBody {
  id: string;
  receiptNumber: number | null;
  status: string;
  paymentStatus: string;
  totalQuantity: number;
  totalAmount: string;
  paidAmount: string;
  outstandingAmount: string;
  staffId: string | null;
  staffName: string | null;
  lines: {
    itemType: string;
    itemName: string;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
    staffId: string | null;
  }[];
  payments: { method: string; amount: string; sessionId: string | null }[];
}

async function envelope(response: Response): Promise<Envelope> {
  return (await response.json()) as Envelope;
}

async function dataOf<T>(response: Response): Promise<T> {
  const body = await envelope(response);
  assert.ok(body.data !== undefined, `expected a data envelope, got ${JSON.stringify(body)}`);
  return body.data as T;
}

/**
 * An id from **this** salon's seeded catalogue, read through the platform scope the
 * way `purge` does. Scoped to `TENANT_A` by name rather than trusting the first row,
 * so another suite seeding an "Aloha Cut" cannot hand this one a foreign id.
 */
async function seededIdOf(kind: "SERVICE" | "PRODUCT"): Promise<string> {
  if (kind === "SERVICE") {
    const row = await runAsPlatform(() =>
      prisma.service.findFirstOrThrow({
        where: { tenantId: TENANT_A, name: "Aloha Cut" },
        select: { id: true },
      }),
    );
    return row.id;
  }
  const row = await runAsPlatform(() =>
    prisma.product.findFirstOrThrow({
      where: { tenantId: TENANT_A, name: "Aloha Shampoo" },
      select: { id: true },
    }),
  );
  return row.id;
}

/**
 * A body the contract accepts: one cut and one shampoo, paid in full in cash — the
 * walk-in case, so nothing here needs a customer. Non-member prices: 50 + 15 = 65.
 */
async function cartBody(): Promise<Record<string, unknown>> {
  return {
    lines: [
      { itemType: "SERVICE", itemId: await seededIdOf("SERVICE"), quantity: 1 },
      { itemType: "PRODUCT", itemId: await seededIdOf("PRODUCT"), quantity: 1 },
    ],
    payments: [{ method: "CASH", amount: 65 }],
  };
}

let baseUrl = "";
let server: Server | undefined;

async function request(method: "GET", path: string, accessToken?: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
  });
}

/**
 * A JSON write, in the same shape as the other route suites here.
 *
 * `token` is separate from `body` so the "not signed in" case can post a valid body with
 * no token — otherwise a 401 and a 422 would be indistinguishable.
 */
async function send(
  method: "POST" | "PATCH",
  path: string,
  body: unknown,
  accessToken?: string,
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe(
  "sales item search endpoint",
  { skip: databaseUrl ? false : "DATABASE_URL is not set" },
  () => {
    let token = "";
    /** The signed-in owner's id, so "who rang it up" defaults can be asserted. */
    let ownerId = "";
    /** The receipt the write test above produced, re-read by the receipt test below. */
    let ringedUp: ReceiptBody | undefined;

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
      ownerId = (
        await runAsPlatform(() =>
          prisma.user.findUniqueOrThrow({ where: { email: EMAIL }, select: { id: true } }),
        )
      ).id;
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

    /*
     * ── The write (5b.2) ──────────────────────────────────────────────────────
     *
     * What a route suite can show that `sale.service.test.ts` cannot: that the mount
     * exists behind `auth`, that a contract refusal arrives as a 422 with the path the
     * browser marks, that the sale-level `staffId` **defaults to the signed-in
     * cashier** (a rule that lives in the handler, not the service), and that a
     * suspended salon is refused by `requireWritableTenant` on this very path while
     * its read stays open.
     */

    it("mounts the write behind auth — a valid body still gets a 401", async () => {
      // The body is valid on purpose: a 401 that a malformed body would also produce
      // would not prove the mount exists rather than the contract refusing first.
      const response = await send("POST", "/api/sales", await cartBody());

      assert.equal(response.status, 401);
    });

    it("refuses a cart with no lines, naming the field the till must mark", async () => {
      const response = await send("POST", "/api/sales", { lines: [], payments: [] }, token);
      const body = await envelope(response);

      assert.equal(response.status, 422);
      assert.equal(body.code, "VALIDATION_FAILED");
      assert.ok(
        body.details?.some((detail) => detail.path === "body.lines"),
        `expected a detail for body.lines, got ${JSON.stringify(body.details)}`,
      );
    });

    it("rings a sale up and answers with the receipt it wrote", async () => {
      const response = await send("POST", "/api/sales", await cartBody(), token);

      assert.equal(response.status, 201);
      const receipt = await dataOf<ReceiptBody>(response);
      ringedUp = receipt;

      assert.equal(receipt.status, "COMPLETED");
      assert.equal(receipt.paymentStatus, "PAID");
      assert.equal(receipt.totalQuantity, 2);
      // Non-member prices from the catalogue: 50 + 15, strings so no cent is a float.
      assert.equal(receipt.totalAmount, "65.00");
      assert.equal(receipt.paidAmount, "65.00");
      assert.equal(receipt.outstandingAmount, "0.00");
      assert.equal(typeof receipt.receiptNumber, "number");
      assert.ok((receipt.receiptNumber ?? 0) >= 1, "the first receipt this salon issues");

      // Who rang it up defaults to the signed-in cashier. This rule lives in the
      // handler, so only this suite can see it.
      assert.equal(receipt.staffId, ownerId);
      assert.equal(receipt.staffName, "Ola Owner");

      assert.deepEqual(
        receipt.lines.map((line) => [line.itemType, line.unitPrice, line.lineTotal]),
        [
          ["SERVICE", "50.00", "50.00"],
          ["PRODUCT", "15.00", "15.00"],
        ],
      );
      assert.deepEqual(receipt.payments, [{ method: "CASH", amount: "65.00", sessionId: null }]);
    });

    it("re-reads that same receipt through GET /api/sales/:id", async () => {
      assert.ok(ringedUp, "the write test above must have run first");

      const response = await request("GET", `/api/sales/${ringedUp.id}`, token);

      // The confirmation screen *is* the receipt (roadmap, Phase 5d): one shape, the
      // same numbers, whether the POST just wrote it or the GET fetches it again.
      assert.equal(response.status, 200);
      assert.deepEqual(await dataOf<ReceiptBody>(response), ringedUp);
    });

    it("answers a sale id that does not exist as not found, not as a crash", async () => {
      const response = await request("GET", "/api/sales/no-such-sale", token);

      assert.equal(response.status, 404);
      assert.equal((await envelope(response)).code, "SALE_NOT_FOUND");
    });

    it("answers a replayed idempotency key with the sale it already wrote", async () => {
      // Q16. The double-tap a slow connection makes must charge once — asserted over
      // HTTP, because the double-tap happens at the till, not inside the service.
      const keyed = { ...(await cartBody()), idempotencyKey: "route-double-tap-0001" };

      const first = await send("POST", "/api/sales", keyed, token);
      const second = await send("POST", "/api/sales", keyed, token);

      assert.equal(first.status, 201);
      assert.equal(second.status, 201);
      const a = await dataOf<ReceiptBody>(first);
      const b = await dataOf<ReceiptBody>(second);
      assert.equal(b.id, a.id, "the second tap must not charge twice");
      assert.equal(b.receiptNumber, a.receiptNumber);

      const stored = await runAsPlatform(() =>
        prisma.sale.count({
          where: { tenantId: TENANT_A, idempotencyKey: "route-double-tap-0001" },
        }),
      );
      assert.equal(stored, 1, "one key, one sale");
    });

    it("lets a suspended salon read its till, but not take money", async () => {
      await runAsPlatform(() =>
        prisma.tenant.update({ where: { id: TENANT_A }, data: { status: "SUSPENDED" } }),
      );
      try {
        const write = await send("POST", "/api/sales", await cartBody(), token);
        assert.equal(write.status, 403);
        assert.equal((await envelope(write)).code, "TENANT_SUSPENDED");

        const read = await request("GET", "/api/sales/items", token);
        assert.equal(read.status, 200, "reading stays open — saas/TENANCY.md §6");
      } finally {
        await runAsPlatform(() =>
          prisma.tenant.update({ where: { id: TENANT_A }, data: { status: "ACTIVE" } }),
        );
      }
    });
  },
);
