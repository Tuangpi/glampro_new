/**
 * The POS item search, against the real database.
 *
 * Three things can only be shown here rather than in the route test:
 *
 * - **An unentitled kind is omitted, not refused.** The salon's own gift-card row
 *   exists and stays invisible while the add-on is unpaid, and `searchableKinds` says
 *   so — which is what lets the picker draw four tabs instead of five or, worse, five
 *   tabs one of which is always empty.
 * - **A lapsed grant is not a grant.** The same row with `expiresAt` in the past must
 *   behave like no row at all, because that is what `requireModule` does and the two
 *   must not disagree.
 * - **`lowStock` is this salon's judgement.** The two tenants are seeded with the same
 *   quantities and different thresholds, so a hard-coded five would fail here.
 *
 * Everything is namespaced by tenant, so a leak shows up as a foreign name in the list
 * rather than as a passing count.
 *
 * Skipped with a clear message when `DATABASE_URL` is absent, so `npm run verify` still
 * passes on a machine with no database running.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import {
  CORE_MODULE_CODES,
  DEFAULT_SALE_ITEM_LIMIT,
  MODULE_CODES,
  SALE_ITEM_KINDS,
  type SaleItem,
  type SaleItemKind,
} from "@glampro/shared";

import { SaleLineItemType } from "../../generated/prisma/enums.js";
import { prisma } from "../lib/prisma.js";
import { runAsPlatform, runAsTenant } from "../lib/tenant-context.js";
import { searchSaleItems } from "./sale.service.js";

const databaseUrl = process.env["DATABASE_URL"];

const TENANT_A = "sale-search-a";
const TENANT_B = "sale-search-b";
const TENANT_IDS = [TENANT_A, TENANT_B];

/**
 * No filters — the query contract makes `search` and `kind` optional, and a caller that
 * omits them wants everything the salon can sell.
 */
const NO_FILTERS = {
  search: undefined,
  kind: undefined,
  limit: DEFAULT_SALE_ITEM_LIMIT,
} as const;

/** A name is `Shampoo <tenant>`, so two salons both holding "Shampoo" stay tellable apart. */
function nameOf(tenantId: string, name: string): string {
  return `${name} ${tenantId}`;
}

async function purge(): Promise<void> {
  await runAsPlatform(async () => {
    await prisma.tenantModule.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.packageService.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.valuePackageService.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.package.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.valuePackage.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.giftCard.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.product.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.service.deleteMany({ where: { tenantId: { in: TENANT_IDS } } });
    await prisma.tenant.deleteMany({ where: { id: { in: TENANT_IDS } } });
  });
}

/**
 * The module catalogue, upserted the way the real seed and `staff.routes.test.ts` do
 * it — `isCore` derived from the shared constant, so the two cannot disagree.
 *
 * `Module` is platform data, so it is never purged: the other suites read these rows.
 */
async function seedModules(): Promise<void> {
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
}

/**
 * Two salons with the same catalogue and different low-stock thresholds, and **no
 * add-ons granted**: this search may sell services and products and nothing else until a
 * test pays for something.
 */
async function seed(): Promise<void> {
  await purge();

  await runAsPlatform(async () => {
    await seedModules();

    await prisma.tenant.create({
      data: { id: TENANT_A, name: "Sale Search A", slug: TENANT_A, lowStockThreshold: 2 },
    });
    await prisma.tenant.create({
      data: { id: TENANT_B, name: "Sale Search B", slug: TENANT_B, lowStockThreshold: 50 },
    });

    for (const tenantId of TENANT_IDS) {
      const cut = await prisma.service.create({
        data: {
          tenantId,
          name: nameOf(tenantId, "Cut"),
          memberPrice: "40.00",
          nonmemberPrice: "50.00",
          points: 5,
          durationMinutes: 45,
        },
      });

      // Archived: still on screen 08, no longer on the till.
      await prisma.service.create({
        data: {
          tenantId,
          name: nameOf(tenantId, "Colour"),
          status: "INACTIVE",
          memberPrice: "80.00",
          nonmemberPrice: "95.00",
        },
      });

      // The threshold boundary from both sides: below A's 2 is low, and 50 is low for B
      // because "at or below" includes the threshold itself.
      await prisma.product.create({
        data: {
          tenantId,
          name: nameOf(tenantId, "Shampoo"),
          memberPrice: "12.50",
          nonmemberPrice: "15.00",
          quantity: 3,
          points: 2,
        },
      });
      await prisma.product.create({
        data: {
          tenantId,
          name: nameOf(tenantId, "Serum"),
          memberPrice: "30.00",
          nonmemberPrice: "35.00",
          quantity: 50,
        },
      });
      await prisma.product.create({
        data: {
          tenantId,
          name: nameOf(tenantId, "Retired Cream"),
          status: "INACTIVE",
          memberPrice: "1.00",
          nonmemberPrice: "2.00",
          quantity: 0,
        },
      });

      const bundle = await prisma.package.create({
        data: {
          tenantId,
          name: nameOf(tenantId, "Aloha Bundle"),
          sessionCount: 10,
          memberPrice: "250.00",
          nonmemberPrice: "300.00",
        },
      });
      await prisma.packageService.create({
        data: { tenantId, packageId: bundle.id, serviceId: cut.id },
      });

      const prepaid = await prisma.valuePackage.create({
        data: {
          tenantId,
          name: nameOf(tenantId, "Prepaid Credit"),
          price: "100.00",
          credit: "120.00",
        },
      });
      await prisma.valuePackageService.create({
        data: { tenantId, valuePackageId: prepaid.id, serviceId: cut.id },
      });

      // No expiry: the wire has to keep "never expires" distinct from "expired".
      await prisma.giftCard.create({
        data: { tenantId, name: nameOf(tenantId, "Aloha Card"), value: "150.00" },
      });
    }
  });
}

/** Grants an add-on outright, which is the state a paid-for module is in. */
async function grant(tenantId: string, code: string, expiresAt: Date | null = null): Promise<void> {
  await runAsPlatform(async () => {
    const module = await prisma.module.findUniqueOrThrow({
      where: { code },
      select: { id: true },
    });

    await prisma.tenantModule.upsert({
      where: { tenantId_moduleId: { tenantId, moduleId: module.id } },
      update: { expiresAt },
      create: { tenantId, moduleId: module.id, expiresAt },
    });
  });
}

/** Removes the row entirely — the state of a salon that never bought it. */
async function revoke(tenantId: string, code: string): Promise<void> {
  await runAsPlatform(async () => {
    const module = await prisma.module.findUniqueOrThrow({
      where: { code },
      select: { id: true },
    });

    await prisma.tenantModule.deleteMany({ where: { tenantId, moduleId: module.id } });
  });
}

/** The item with this name, or a failure that names what *was* returned. */
function itemNamed(items: SaleItem[], name: string): SaleItem {
  const found = items.find((item) => item.name === name);
  if (!found) {
    throw new Error(`no item named "${name}"; got ${items.map((item) => item.name).join(", ")}`);
  }
  return found;
}

/** Narrows to one kind, so a test can read the columns only that kind has. */
function asKind<K extends SaleItemKind>(item: SaleItem, kind: K): Extract<SaleItem, { kind: K }> {
  if (item.kind !== kind) throw new Error(`expected ${kind}, got ${item.kind}`);
  return item as Extract<SaleItem, { kind: K }>;
}

describe(
  "sale.service item search, against the database",
  { skip: databaseUrl ? false : "DATABASE_URL is not set" },
  () => {
    before(seed);
    after(purge);

    it("keeps the five kinds and the cart's discriminator in step", () => {
      // The cart stores `SaleLine.itemType`, so a kind this list knows and the schema
      // does not — or the reverse — is a row the till could search and never save.
      assert.deepEqual([...SALE_ITEM_KINDS], Object.keys(SaleLineItemType));
    });

    it("offers only services and products while no add-on is paid for", async () => {
      await revoke(TENANT_A, "packages");
      await revoke(TENANT_A, "giftCards");

      const result = await runAsTenant(TENANT_A, () => searchSaleItems(NO_FILTERS));

      assert.deepEqual(result.searchableKinds, ["SERVICE", "PRODUCT"]);
      // Sorted by name rather than by kind — Cut, Serum, Shampoo — so the two archived
      // rows ("Colour" and "Retired Cream") are the ones that are absent.
      assert.deepEqual(
        result.items.map((item) => item.name),
        [nameOf(TENANT_A, "Cut"), nameOf(TENANT_A, "Serum"), nameOf(TENANT_A, "Shampoo")],
      );
      assert.deepEqual(
        result.items.map((item) => item.kind),
        ["SERVICE", "PRODUCT", "PRODUCT"],
      );
    });

    it("omits an unentitled kind rather than refusing or emptying the screen", async () => {
      // The salon *has* a card and a bundle; without the add-ons it may not sell them,
      // so the rows stay out and `searchableKinds` is what lets the picker say why.
      const result = await runAsTenant(TENANT_A, () => searchSaleItems(NO_FILTERS));

      assert.equal(
        result.items.some((item) => item.kind === "GIFT_CARD"),
        false,
      );
      assert.equal(
        result.items.some((item) => item.kind === "PACKAGE"),
        false,
      );
    });

    it("adds both bundle kinds at once when the packages add-on is granted", async () => {
      await grant(TENANT_A, "packages");

      const result = await runAsTenant(TENANT_A, () => searchSaleItems(NO_FILTERS));

      assert.deepEqual(result.searchableKinds, ["SERVICE", "PRODUCT", "PACKAGE", "VALUE_PACKAGE"]);

      const bundle = asKind(itemNamed(result.items, nameOf(TENANT_A, "Aloha Bundle")), "PACKAGE");
      assert.equal(bundle.sessionCount, 10);
      assert.equal(bundle.serviceCount, 1, "the relation's length, not a second read");
      assert.equal(bundle.price, "300.00", "the non-member price is what a line starts at");
      assert.equal(bundle.memberPrice, "250.00");

      const prepaid = asKind(
        itemNamed(result.items, nameOf(TENANT_A, "Prepaid Credit")),
        "VALUE_PACKAGE",
      );
      assert.equal(prepaid.price, "100.00", "what the customer pays");
      assert.equal(prepaid.credit, "120.00", "what they receive");
      assert.equal(prepaid.memberPrice, null, "one price, so there is no member price");

      // Still the salon's to see on screen 08, still not the till's.
      assert.equal(
        result.items.some((item) => item.kind === "GIFT_CARD"),
        false,
      );
    });

    it("treats a lapsed grant as no grant, exactly as the route guard does", async () => {
      await grant(TENANT_A, "packages", new Date(Date.now() - 60_000));

      const lapsed = await runAsTenant(TENANT_A, () => searchSaleItems(NO_FILTERS));
      assert.deepEqual(lapsed.searchableKinds, ["SERVICE", "PRODUCT"]);
      assert.equal(
        lapsed.items.some((item) => item.kind === "PACKAGE"),
        false,
      );

      // Restored, so the tests after this one still have a bundle to sell.
      await grant(TENANT_A, "packages");
    });

    it("sells a card template once the gift-cards add-on is granted", async () => {
      await grant(TENANT_A, "giftCards");

      const result = await runAsTenant(TENANT_A, () => searchSaleItems(NO_FILTERS));

      assert.deepEqual(result.searchableKinds, [
        "SERVICE",
        "PRODUCT",
        "PACKAGE",
        "VALUE_PACKAGE",
        "GIFT_CARD",
      ]);

      const card = asKind(itemNamed(result.items, nameOf(TENANT_A, "Aloha Card")), "GIFT_CARD");
      // One money column, so the face value is the price — and `expiresAt: null` has to
      // survive as "never", not as a date somebody guessed.
      assert.equal(card.price, "150.00");
      assert.equal(card.expiresAt, null);
    });

    it("narrows the rows by kind without shrinking the kinds it reports", async () => {
      const onlyProducts = await runAsTenant(TENANT_A, () =>
        searchSaleItems({ ...NO_FILTERS, kind: "PRODUCT" }),
      );

      assert.deepEqual(
        onlyProducts.items.map((item) => item.kind),
        ["PRODUCT", "PRODUCT"],
      );
      // Switching tabs must not watch the salon's capabilities shrink request by
      // request, so the full list comes back with every answer.
      assert.deepEqual(onlyProducts.searchableKinds, [
        "SERVICE",
        "PRODUCT",
        "PACKAGE",
        "VALUE_PACKAGE",
        "GIFT_CARD",
      ]);
    });

    it("answers with nothing for a kind the add-on does not cover, rather than refusing", async () => {
      await revoke(TENANT_A, "giftCards");

      const cards = await runAsTenant(TENANT_A, () =>
        searchSaleItems({ ...NO_FILTERS, kind: "GIFT_CARD" }),
      );

      assert.deepEqual(cards.items, []);
      assert.equal(cards.searchableKinds.includes("GIFT_CARD"), false);

      await grant(TENANT_A, "giftCards");
    });

    it("matches the name loosely and keeps archived rows off the till", async () => {
      const result = await runAsTenant(TENANT_A, () =>
        searchSaleItems({ ...NO_FILTERS, search: "shamP" }),
      );

      assert.deepEqual(
        result.items.map((item) => item.name),
        [nameOf(TENANT_A, "Shampoo")],
      );
      assert.equal(
        result.items.some((item) => item.name === nameOf(TENANT_A, "Retired Cream")),
        false,
      );
    });

    it("caps each kind rather than the list, so one big kind cannot crowd out the rest", async () => {
      const result = await runAsTenant(TENANT_A, () =>
        searchSaleItems({ ...NO_FILTERS, limit: 1 }),
      );

      // One row per searchable kind and nothing else, which a single shared budget could
      // not have guaranteed. Compared sorted, because the list itself is ordered by name
      // rather than by kind.
      assert.deepEqual(
        result.items.map((item) => item.kind).sort(),
        [...result.searchableKinds].sort(),
      );
    });

    it("sorts the merged list by name, so one search twice reads the same", async () => {
      const first = await runAsTenant(TENANT_A, () => searchSaleItems(NO_FILTERS));
      const second = await runAsTenant(TENANT_A, () => searchSaleItems(NO_FILTERS));

      const names = first.items.map((item) => item.name);
      assert.deepEqual(
        names,
        [...names].sort((a, b) => a.localeCompare(b)),
      );
      assert.deepEqual(second.items, first.items);
    });

    it("judges low stock against this salon's own threshold", async () => {
      const forA = await runAsTenant(TENANT_A, () =>
        searchSaleItems({ ...NO_FILTERS, kind: "PRODUCT" }),
      );
      const forB = await runAsTenant(TENANT_B, () =>
        searchSaleItems({ ...NO_FILTERS, kind: "PRODUCT" }),
      );

      // Same quantities, different thresholds: A holds 3 as plenty, B counts 50 as low.
      const shampooOfA = asKind(itemNamed(forA.items, nameOf(TENANT_A, "Shampoo")), "PRODUCT");
      const shampooOfB = asKind(itemNamed(forB.items, nameOf(TENANT_B, "Shampoo")), "PRODUCT");
      assert.equal(shampooOfA.lowStock, false);
      assert.equal(shampooOfB.lowStock, true);

      const serumOfB = asKind(itemNamed(forB.items, nameOf(TENANT_B, "Serum")), "PRODUCT");
      assert.equal(serumOfB.quantity, 50);
      assert.equal(serumOfB.lowStock, true, "at the threshold counts as low");
    });

    it("never returns another salon's rows", async () => {
      const result = await runAsTenant(TENANT_A, () => searchSaleItems(NO_FILTERS));

      assert.ok(result.items.length > 0);
      for (const item of result.items) {
        assert.ok(
          item.name.endsWith(TENANT_A),
          `"${item.name}" belongs to the other salon, which this search must not read`,
        );
      }
    });

    it("refuses to run outside a tenant scope, where it would read every salon's grants", async () => {
      await assert.rejects(
        runAsPlatform(() => searchSaleItems(NO_FILTERS)),
        /tenant scope/,
      );
    });
  },
);
