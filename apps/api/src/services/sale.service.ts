/**
 * Sales — handoff screens 01–02, `/api/sales`.
 *
 * Two halves of one flow live here. The **item search** the cashier types into before
 * anything is in the cart (Phase 5b.1), and the **write** that turns that cart into a
 * receipt (Phase 5b.2): the priced lines, the tenders, the ledgers it fills and the
 * receipt number the confirmation screen prints.
 *
 * The search is **entitlement aware**, and that is the interesting part. A route
 * guarded by an add-on refuses with `403 MODULE_NOT_ENTITLED`, which is right when the
 * whole route *is* the add-on. Here the add-on is one kind among five inside a core
 * feature, so a salon without it gets a shorter list rather than a refused request —
 * and the answer names the kinds it covers (`searchableKinds`) so the picker can draw
 * the tabs it can fill instead of an empty one. "You have none" and "you do not have
 * this" stay different statements, which is the rule the catalogue tabs already keep.
 *
 * The **write refuses** rather than omits, and that asymmetry is deliberate: the
 * search answers "what may I show", where a missing tab costs nothing, while the write
 * answers "may this salon sell that", where quietly dropping the line would sell a
 * haircut and lose a shampoo.
 *
 * Like every other service here, each function runs inside the tenant scope
 * `middleware/auth.ts` opened, so none of them takes a tenant id. Rows are serialised
 * **through** the shared Zod schemas, so a column added to a model and forgotten here
 * throws instead of reaching the browser outside its contract (AGENTS.md rule 6).
 */
import {
  MAX_RECEIPT_NUMBER,
  SALE_ITEM_KINDS,
  saleDetailSchema,
  saleItemSearchResultSchema,
  type CreateSaleInput,
  type ModuleCode,
  type SaleDetail,
  type SaleItem,
  type SaleItemKind,
  type SaleItemSearchQuery,
  type SaleItemSearchResult,
  type SaleLineInput,
} from "@glampro/shared";

import { moduleEntitlements } from "../lib/entitlements.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { currentScope } from "../lib/tenant-context.js";
import { resolveLowStockThreshold } from "./catalogue.service.js";
import { Prisma } from "../../generated/prisma/client.js";

/**
 * Which module each kind belongs to. A kind is searchable when its module is
 * effective for the caller's salon.
 *
 * `VALUE_PACKAGE` rides the `packages` add-on rather than a module of its own:
 * `MODULE_CODES` has no value-package code, and prepaid credit is bought and sold
 * exactly like a bundle of sessions, so a salon either has both or neither. Giving it
 * a fifteenth code would mean an entitlement nobody's contract mentions.
 */
const KIND_MODULE: Record<SaleItemKind, ModuleCode> = {
  SERVICE: "catalogue",
  PRODUCT: "catalogue",
  PACKAGE: "packages",
  VALUE_PACKAGE: "packages",
  GIFT_CARD: "giftCards",
};

/** A `Decimal(12,2)` on the wire is a string, so no cent is lost to a float. */
function money(value: { toFixed: (digits: number) => string }): string {
  return value.toFixed(2);
}

/**
 * The one search box matches the name.
 *
 * The catalogue's text box matches the name **or** the description because its own
 * placeholder says "Search items…"; the till's box is the cashier typing what the
 * customer asked for, so a description match would put a row on screen whose name the
 * cashier did not type. Nothing else is filtered: a kind's own columns do the rest.
 */
function nameWhere(search: string | undefined) {
  return search ? { name: { contains: search, mode: "insensitive" as const } } : {};
}

/**
 * `status: ACTIVE` everywhere it exists.
 *
 * The till sells what the salon still offers, so an archived product, service, bundle
 * or value package is not searchable — that is what archiving is for. `GiftCard` has
 * no status column, so a card template is always sellable; whether an **expired**
 * template should be too is a rule 5b.2 has to decide at the till, and inventing one
 * here would quietly hide a row the salon can see on screen 08.
 */

/** Sellable services. */
async function searchServices(search: string | undefined, limit: number): Promise<SaleItem[]> {
  const rows = await prisma.service.findMany({
    where: { ...nameWhere(search), status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      memberPrice: true,
      nonmemberPrice: true,
      points: true,
      durationMinutes: true,
    },
    // `id` breaks ties so the grid's order is stable when two services share a name.
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: limit,
  });

  return rows.map((row) => ({
    kind: "SERVICE",
    id: row.id,
    name: row.name,
    price: money(row.nonmemberPrice),
    memberPrice: money(row.memberPrice),
    points: row.points,
    durationMinutes: row.durationMinutes,
  }));
}

/** Sellable products. `lowStock` is computed here, never in the browser (ADR 0010). */
async function searchProducts(search: string | undefined, limit: number): Promise<SaleItem[]> {
  const threshold = await resolveLowStockThreshold();

  const rows = await prisma.product.findMany({
    where: { ...nameWhere(search), status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      memberPrice: true,
      nonmemberPrice: true,
      quantity: true,
      points: true,
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: limit,
  });

  return rows.map((row) => ({
    kind: "PRODUCT",
    id: row.id,
    name: row.name,
    price: money(row.nonmemberPrice),
    memberPrice: money(row.memberPrice),
    points: row.points,
    quantity: row.quantity,
    lowStock: row.quantity <= threshold,
  }));
}

/**
 * Sellable bundles. `serviceCount` is the relation's length rather than a second
 * read — the count the till draws and the count the catalogue tab draws then come
 * from the same query.
 */
async function searchPackages(search: string | undefined, limit: number): Promise<SaleItem[]> {
  const rows = await prisma.package.findMany({
    where: { ...nameWhere(search), status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      memberPrice: true,
      nonmemberPrice: true,
      sessionCount: true,
      services: { select: { id: true } },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: limit,
  });

  return rows.map((row) => ({
    kind: "PACKAGE",
    id: row.id,
    name: row.name,
    price: money(row.nonmemberPrice),
    memberPrice: money(row.memberPrice),
    sessionCount: row.sessionCount,
    serviceCount: row.services.length,
  }));
}

/** Sellable prepaid credit. Legacy `valuepackages`. */
async function searchValuePackages(search: string | undefined, limit: number): Promise<SaleItem[]> {
  const rows = await prisma.valuePackage.findMany({
    where: { ...nameWhere(search), status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      price: true,
      credit: true,
      services: { select: { id: true } },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: limit,
  });

  return rows.map((row) => ({
    kind: "VALUE_PACKAGE",
    id: row.id,
    name: row.name,
    price: money(row.price),
    // One price and no member/non-member pair, so there is nothing a member could be
    // charged instead — `null`, not a copy of `price`.
    memberPrice: null,
    credit: money(row.credit),
    serviceCount: row.services.length,
  }));
}

/** Sellable card templates. No status to filter on, and an absent expiry is "never". */
async function searchGiftCards(search: string | undefined, limit: number): Promise<SaleItem[]> {
  const rows = await prisma.giftCard.findMany({
    where: nameWhere(search),
    select: { id: true, name: true, value: true, expiresAt: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: limit,
  });

  return rows.map((row) => ({
    kind: "GIFT_CARD",
    id: row.id,
    name: row.name,
    // The card's face value *is* what the customer pays for it; `GiftCard` has one
    // money column, so there is no second price to return.
    price: money(row.value),
    memberPrice: null,
    expiresAt: row.expiresAt === null ? null : row.expiresAt.toISOString(),
  }));
}

/** The reader for one kind. The switch is exhaustive, so a new kind cannot be forgotten. */
function readKind(
  kind: SaleItemKind,
  search: string | undefined,
  limit: number,
): Promise<SaleItem[]> {
  switch (kind) {
    case "SERVICE":
      return searchServices(search, limit);
    case "PRODUCT":
      return searchProducts(search, limit);
    case "PACKAGE":
      return searchPackages(search, limit);
    case "VALUE_PACKAGE":
      return searchValuePackages(search, limit);
    case "GIFT_CARD":
      return searchGiftCards(search, limit);
  }
}

/**
 * One list out of five catalogues, in one order.
 *
 * By name first, because that is what the cashier typed and what the other list screens
 * sort by. Two rows sharing a name are separated by the kind's place in
 * `SALE_ITEM_KINDS`, and `id` breaks the last tie, so the same search twice returns the
 * same list.
 */
function byNameThenKind(a: SaleItem, b: SaleItem): number {
  return (
    a.name.localeCompare(b.name) ||
    SALE_ITEM_KINDS.indexOf(a.kind) - SALE_ITEM_KINDS.indexOf(b.kind) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * The POS item search — five kinds behind one box.
 *
 * One endpoint rather than the picker making five requests, because the cart treats the
 * kinds identically: `SaleLine` stores all five with a single discriminator. Five
 * requests would also fail five different ways for a salon with no add-ons.
 */
export async function searchSaleItems(query: SaleItemSearchQuery): Promise<SaleItemSearchResult> {
  const { entitled } = await moduleEntitlements();

  // The kinds this salon may sell. An add-on it has not bought is absent here and
  // contributes no rows — that absence is how the picker knows which tabs to draw.
  const searchableKinds = SALE_ITEM_KINDS.filter((kind) => entitled.has(KIND_MODULE[kind]));

  // `?kind=` narrows the rows only. `searchableKinds` stays the whole picture, or a
  // client switching tabs would watch its own capabilities shrink request by request.
  const requested = query.kind
    ? searchableKinds.filter((kind) => kind === query.kind)
    : searchableKinds;

  const groups = await Promise.all(
    requested.map((kind) => readKind(kind, query.search, query.limit)),
  );

  // Parsed once for the whole answer. Each reader names the columns of one kind, and
  // this is where a reader that left one out is caught rather than shipping it
  // (AGENTS.md rule 6).
  return saleItemSearchResultSchema.parse({
    searchableKinds,
    items: groups.flat().sort(byNameThenKind),
  });
}

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * The write (Phase 5b.2)
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** A `Decimal(12,2)` on the wire is a string, so no cent is lost to a float. */
function amount(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

/**
 * The tenant this write belongs to, from the verified scope.
 *
 * `currentScope()` rather than a parameter, because a tenant id must never arrive from
 * the request (`docs/saas/TENANCY.md`). A platform scope is refused outright:
 * importing history writes sales outside any single salon, and that is Phase 9's
 * problem with an explicit answer, not something to fall into by accident.
 */
function requireTenantScope(): string {
  const scope = currentScope();
  if (scope?.kind !== "tenant") {
    throw new Error(
      "A sale is written inside a tenant scope, and this write ran without one. " +
        "Wrap it in runAsTenant(): a platform scope would file the sale under no salon.",
    );
  }
  return scope.tenantId;
}

/**
 * A line that cannot be sold, named in the message.
 *
 * A 404 here would be a lie the cashier cannot act on — the row exists, it is simply
 * not for sale. The line index is in the details so the cart can mark that row.
 */
function notSellable(index: number, name: string, reason: string): never {
  const message = `${name} cannot be sold: ${reason}.`;
  throw badRequest(message, [{ path: `body.lines.${index}`, message }]);
}

/**
 * Every staff id the body names, checked against this salon.
 *
 * `staffId` arrives from the request — on the sale and per line — so it is checked
 * like every other id this write links to (the customer lookup, the catalogue rows in
 * `priceCart`): read back through the tenant scope, refused when the row is not
 * there. The scoped read cannot tell "no such person" from "somebody else's", and
 * must not — the answer is the same either way, and "forbidden" would confirm the id
 * exists somewhere.
 *
 * Without this, a bogus id is a foreign-key violation the cashier sees as a 500, and
 * another salon's stylist is a row that **does** exist, so the link would be written
 * and a foreign tenant's user credited for this sale's performance. A credit line is
 * money's paper trail; it does not cross salons.
 *
 * The path is per refusal, so the cart can mark the row that named a stranger rather
 * than failing with one undirected message.
 */
async function assertStaffExist(input: CreateSaleInput): Promise<void> {
  const ids = new Set<string>();
  if (input.staffId !== undefined) ids.add(input.staffId);
  for (const line of input.lines) {
    if (line.staffId !== undefined) ids.add(line.staffId);
  }
  if (ids.size === 0) return;

  const rows = await prisma.user.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true },
  });
  const known = new Set(rows.map((row) => row.id));
  if ([...ids].every((id) => known.has(id))) return;

  const message = "That staff member does not exist.";
  const details: { path: string; message: string }[] = [];
  if (input.staffId !== undefined && !known.has(input.staffId)) {
    details.push({ path: "body.staffId", message });
  }
  input.lines.forEach((line, index) => {
    if (line.staffId !== undefined && !known.has(line.staffId)) {
      details.push({ path: `body.lines.${index}.staffId`, message });
    }
  });
  throw badRequest(message, details);
}

/**
 * Which catalogue row a line points at, once resolved and priced.
 *
 * The price is **not** read from the request. It is computed here from the catalogue
 * and the customer, which is the whole point of the asymmetry the contract documents.
 */
interface ResolvedLine {
  itemType: SaleItemKind;
  itemId: string;
  itemName: string;
  unitPrice: Prisma.Decimal;
  /** Sessions, credit or card value one unit grants — the three granting kinds. */
  grant: Prisma.Decimal | number | null;
  /** The expiry an issued gift card inherits. */
  expiresAt: Date | null;
  points: number;
  /** Stock on hand, for the kinds that have stock. */
  stock: number | null;
}

/**
 * Picks the price for one line.
 *
 * The member/non-member pair is a **server** decision because it depends on the
 * customer attached to the sale, which the cashier can change after searching: a
 * customer carrying a membership reference (`Customer.memberId`) gets the member price,
 * a walk-in and an ordinary customer get the non-member one. The two money kinds hold
 * a single column and so have only one price.
 *
 * `memberId` being free text rather than a row is legacy's shape
 * (`customers.member_id`), and the rebuild keeps it that way, so "is a member" means
 * "carries a membership reference" and nothing more is invented.
 */
function priceLine(
  itemType: SaleItemKind,
  memberPrice: Prisma.Decimal,
  nonmemberPrice: Prisma.Decimal,
  isMember: boolean,
): Prisma.Decimal {
  switch (itemType) {
    case "SERVICE":
    case "PRODUCT":
    case "PACKAGE":
      return isMember ? memberPrice : nonmemberPrice;
    case "VALUE_PACKAGE":
    case "GIFT_CARD":
      return memberPrice;
  }
}

/**
 * Loads the catalogue rows for one kind, keyed by id.
 *
 * One query per kind rather than one per line, so a hundred-line cart is a handful of
 * round trips. Every query is tenant-scoped by the extension, so a foreign id is not
 * "another salon's row", it is **not found** — the same answer a search gives.
 */
async function loadKind(
  kind: SaleItemKind,
  lines: SaleLineInput[],
  isMember: boolean,
): Promise<Map<string, ResolvedLine>> {
  const ids = lines.map((line) => line.itemId);
  const rows = new Map<string, ResolvedLine>();
  const indexOf = (id: string) => lines.findIndex((line) => line.itemId === id);

  switch (kind) {
    case "SERVICE": {
      for (const row of await prisma.service.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          name: true,
          status: true,
          memberPrice: true,
          nonmemberPrice: true,
          points: true,
        },
      })) {
        if (row.status !== "ACTIVE") notSellable(indexOf(row.id), row.name, "it is archived");
        rows.set(row.id, {
          itemType: kind,
          itemId: row.id,
          itemName: row.name,
          unitPrice: priceLine(kind, row.memberPrice, row.nonmemberPrice, isMember),
          grant: null,
          expiresAt: null,
          points: row.points,
          stock: null,
        });
      }
      return rows;
    }

    case "PRODUCT": {
      for (const row of await prisma.product.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          name: true,
          status: true,
          memberPrice: true,
          nonmemberPrice: true,
          points: true,
          quantity: true,
        },
      })) {
        if (row.status !== "ACTIVE") notSellable(indexOf(row.id), row.name, "it is archived");
        rows.set(row.id, {
          itemType: kind,
          itemId: row.id,
          itemName: row.name,
          unitPrice: priceLine(kind, row.memberPrice, row.nonmemberPrice, isMember),
          grant: null,
          expiresAt: null,
          points: row.points,
          stock: row.quantity,
        });
      }
      return rows;
    }

    case "PACKAGE": {
      for (const row of await prisma.package.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          name: true,
          status: true,
          memberPrice: true,
          nonmemberPrice: true,
          sessionCount: true,
        },
      })) {
        if (row.status !== "ACTIVE") notSellable(indexOf(row.id), row.name, "it is archived");
        rows.set(row.id, {
          itemType: kind,
          itemId: row.id,
          itemName: row.name,
          unitPrice: priceLine(kind, row.memberPrice, row.nonmemberPrice, isMember),
          // One unit grants its sessions, which is what a holding counts in.
          grant: row.sessionCount,
          expiresAt: null,
          points: 0,
          stock: null,
        });
      }
      return rows;
    }

    case "VALUE_PACKAGE": {
      for (const row of await prisma.valuePackage.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, status: true, price: true, credit: true },
      })) {
        if (row.status !== "ACTIVE") notSellable(indexOf(row.id), row.name, "it is archived");
        rows.set(row.id, {
          itemType: kind,
          itemId: row.id,
          itemName: row.name,
          unitPrice: row.price,
          // The credit granted, deliberately **not** the price paid: a salon can sell
          // credit at a discount, and a holding that recorded the price would be wrong.
          grant: row.credit,
          expiresAt: null,
          points: 0,
          stock: null,
        });
      }
      return rows;
    }

    case "GIFT_CARD": {
      const now = new Date();
      for (const row of await prisma.giftCard.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, value: true, expiresAt: true },
      })) {
        // The rule the search deliberately left to this slice: an expired template is
        // not sellable. The search still shows it — `GiftCard` has no status column, so
        // "expired" is not "archived" — and refusing here is what stops the two halves
        // of the till from disagreeing about what is for sale.
        if (row.expiresAt !== null && row.expiresAt <= now) {
          notSellable(indexOf(row.id), row.name, "the card has expired");
        }
        rows.set(row.id, {
          itemType: kind,
          itemId: row.id,
          itemName: row.name,
          // The card's face value is what the customer pays for it; one money column.
          unitPrice: row.value,
          grant: row.value,
          expiresAt: row.expiresAt,
          points: 0,
          stock: null,
        });
      }
      return rows;
    }
  }
}

/** The kinds that grant something to a customer, and so need one. */
const GRANTING_KINDS: ReadonlySet<SaleItemKind> = new Set<SaleItemKind>([
  "PACKAGE",
  "VALUE_PACKAGE",
  "GIFT_CARD",
]);

/** A line with its catalogue row resolved, priced and checked. */
interface PricedLine {
  input: SaleLineInput;
  item: ResolvedLine;
  lineTotal: Prisma.Decimal;
  pointsEarned: number;
}

/**
 * Resolves every line in the cart against the catalogue and prices it.
 *
 * Two refusals happen here, both before anything is written:
 *
 * 1. **An unentitled kind.** The search omits a kind the salon has not bought; the
 *    write refuses it. Posting a bundle to a salon without the `packages` add-on would
 *    otherwise create a holding nothing can ever spend.
 * 2. **A line whose row is gone.** A stale cart naming a deleted id fails the whole
 *    write rather than quietly pricing it at zero.
 */
async function priceCart(lines: SaleLineInput[], isMember: boolean): Promise<PricedLine[]> {
  const { entitled } = await moduleEntitlements();

  const byKind = new Map<SaleItemKind, SaleLineInput[]>();
  for (const line of lines) {
    if (!entitled.has(KIND_MODULE[line.itemType])) {
      throw forbidden(
        `Your salon has not bought the ${KIND_MODULE[line.itemType]} module, so it cannot sell a ${line.itemType}.`,
        "MODULE_NOT_ENTITLED",
      );
    }
    const group = byKind.get(line.itemType);
    if (group) group.push(line);
    else byKind.set(line.itemType, [line]);
  }

  const loaded = new Map<string, ResolvedLine>();
  for (const [kind, group] of byKind) {
    for (const [id, row] of await loadKind(kind, group, isMember)) loaded.set(id, row);
  }

  return lines.map((line, index) => {
    const item = loaded.get(line.itemId);
    if (!item) {
      throw badRequest("One of the items in the cart no longer exists.", [
        { path: `body.lines.${index}.itemId`, message: "This item no longer exists." },
      ]);
    }

    // Stock is checked against the row read a moment ago, and the decrement happens in
    // the same transaction that writes the sale, so two tills selling the last bottle
    // cannot both succeed: the second finds nothing left to decrement.
    if (item.stock !== null && line.quantity > item.stock) {
      throw badRequest(`There are only ${item.stock} × ${item.itemName} in stock.`, [
        { path: `body.lines.${index}.quantity`, message: `Only ${item.stock} left in stock.` },
      ]);
    }

    return {
      input: line,
      item,
      lineTotal: item.unitPrice.mul(line.quantity),
      // Points are per unit, so a line of three earns three times one.
      pointsEarned: item.points * line.quantity,
    };
  });
}

/**
 * Writes the sale and everything that hangs off it, in one transaction.
 *
 * **All of it or none of it.** A sale whose receipt number was taken but whose lines
 * failed is a number the salon never printed and a customer who was charged nothing;
 * a line written without its holding is a package a customer paid for and cannot use.
 * The ledgers are part of the sale, not bookkeeping that follows it, so they live in
 * the same transaction as the sale row.
 *
 * The receipt number is allocated here, from the tenant's own counter (ADR 0011), by
 * an atomic increment. Two tills rung up at the same instant therefore take different
 * numbers, and a rolled-back write gives its number back rather than burning it.
 */
async function writeSale(
  tenantId: string,
  input: CreateSaleInput,
  priced: PricedLine[],
  customerId: string | null,
): Promise<string> {
  const totalQuantity = priced.reduce((sum, line) => sum + line.input.quantity, 0);
  const totalAmount = priced.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0));
  const paidAmount = input.payments.reduce(
    (sum, tender) => sum.plus(tender.amount),
    new Prisma.Decimal(0),
  );

  // A balance is a *positive* remainder: overpayment is change given, not a negative
  // debt, and a customer who hands over a hundred for eighty is not owed twenty.
  const outstandingAmount = Prisma.Decimal.max(totalAmount.minus(paidAmount), 0);
  const paymentStatus = paidAmount.greaterThanOrEqualTo(totalAmount) ? "PAID" : "UNPAID";
  const soldAt = new Date();

  return prisma.$transaction(async (tx) => {
    const { receiptCounter } = await tx.tenant.update({
      where: { id: tenantId },
      data: { receiptCounter: { increment: 1 } },
      select: { receiptCounter: true },
    });

    // The ceiling is a real `Int` bound, not decoration: a counter that reached it
    // would store a number the contract's `saleDetailSchema` refuses to parse, so the
    // write stops here with an explanation instead of writing an unreadable receipt.
    if (receiptCounter > MAX_RECEIPT_NUMBER) {
      throw conflict(
        "This salon has used every available receipt number. Please contact your provider.",
        "RECEIPT_NUMBER_EXHAUSTED",
      );
    }

    const sale = await tx.sale.create({
      data: {
        tenantId,
        customerId,
        staffId: input.staffId ?? null,
        // The till rings a sale up; `HELD` is for a quote the cashier has not confirmed.
        status: "COMPLETED",
        totalQuantity,
        totalAmount,
        paidAmount,
        paymentStatus,
        soldAt,
        note: input.note ?? null,
        receiptNumber: receiptCounter,
        idempotencyKey: input.idempotencyKey ?? null,
      },
      select: { id: true },
    });

    // `createMany` rather than a nested `create`: the Prisma extension merges
    // `tenantId` into the payload it is handed and cannot reach inside a nested write,
    // which is why every other service links with `deleteMany`/`createMany` too. The
    // `position` is what puts the lines back in cart order on the receipt.
    await tx.saleLine.createMany({
      data: priced.map((line, index) => ({
        tenantId,
        saleId: sale.id,
        itemType: line.item.itemType,
        itemId: line.item.itemId,
        // Snapshotted at sale time, so archiving a service keeps the receipt readable.
        itemName: line.item.itemName,
        quantity: line.input.quantity,
        unitPrice: line.item.unitPrice,
        lineTotal: line.lineTotal,
        staffId: line.input.staffId ?? null,
        position: index,
      })),
    });

    // One row per tender, so a split is two rows rather than a string no report can sum.
    await tx.salePayment.createMany({
      data: input.payments.map((tender) => ({
        tenantId,
        saleId: sale.id,
        method: tender.method,
        amount: tender.amount,
        sessionId: tender.sessionId ?? null,
      })),
    });

    await fillLedgers(tx, tenantId, sale.id, customerId, priced, paymentStatus, outstandingAmount);

    return sale.id;
  });
}

/**
 * The ledgers the sale fills.
 *
 * Five things, and each exists because legacy wrote it in the same request as the sale:
 *
 * - **Stock** comes off the product. Legacy did this in the sale controller
 *   (`SaleController::insertProduct`, a `decrement('quantity', …)` on the row) rather
 *   than in an inventory screen, so leaving it out would let a salon sell the same
 *   bottle twice and show stock it does not have.
 * - **Holdings** are granted for the three kinds that give something: sessions for a
 *   bundle, credit for a value package, a card for a gift card. Each names the line
 *   that granted it, so "which sale gave this customer their package" is answerable.
 * - **Points** are one signed row per sale, not a running balance — the balance is
 *   `SUM(point)`, so a correction is an offsetting row and never an edit to history.
 * - **An outstanding balance** when the sale is not paid in full.
 * - **Performance** for every line that named a stylist, which is what the staff
 *   report reads. Legacy recorded this per sold item rather than per sale.
 */
async function fillLedgers(
  tx: SaleTransaction,
  tenantId: string,
  saleId: string,
  customerId: string | null,
  priced: PricedLine[],
  paymentStatus: "PAID" | "UNPAID",
  outstandingAmount: Prisma.Decimal,
): Promise<void> {
  // Stock, per product line. `updateMany` with a `gte` guard rather than a bare
  // decrement, so a second till that read the same stock cannot take it below zero:
  // the guarded update matches no rows and this transaction rolls back.
  for (const line of priced) {
    if (line.item.stock === null) continue;
    const taken = await tx.product.updateMany({
      where: { id: line.item.itemId, quantity: { gte: line.input.quantity } },
      data: { quantity: { decrement: line.input.quantity } },
    });
    if (taken.count === 0) {
      throw conflict(
        `${line.item.itemName} just sold out. Nothing has been charged.`,
        "INSUFFICIENT_STOCK",
      );
    }
  }

  if (customerId !== null) {
    await grantHoldings(tx, tenantId, saleId, customerId, priced);
  }

  // A point row needs a customer; a walk-in earns nothing, which is why the contract
  // documents `pointsEarned` as `0` for one rather than leaving it undefined.
  const pointsEarned = priced.reduce((sum, line) => sum + line.pointsEarned, 0);
  if (customerId !== null && pointsEarned !== 0) {
    await tx.customerPoint.create({
      data: { tenantId, customerId, saleId, point: pointsEarned },
    });
  }

  // An outstanding balance is a debt owed **by a named customer**. A walk-in that was
  // not paid in full has nobody to chase, so it is refused rather than recorded against
  // nobody.
  if (paymentStatus === "UNPAID" && outstandingAmount.greaterThan(0)) {
    if (customerId === null) {
      throw badRequest("This sale is not paid in full, so it needs a customer.", [
        { path: "body.customerId", message: "Required when the sale is not paid in full." },
      ]);
    }
    await tx.customerOutstanding.create({
      data: { tenantId, customerId, saleId, unpaidAmount: outstandingAmount },
    });
  }

  // Performance, one row per attributed line. `amount` is the **line total**, which is
  // what legacy's `employee_performances.amount` meant and what a percentage report
  // multiplies; the per-unit amount would under-report a line of three.
  const attributed = priced.filter((line) => line.input.staffId !== undefined);
  if (attributed.length > 0) {
    await tx.employeePerformance.createMany({
      data: attributed.map((line) => ({
        tenantId,
        // Safe: the filter above is exactly `staffId !== undefined`.
        userId: line.input.staffId as string,
        saleId,
        itemType: line.item.itemType,
        itemId: line.item.itemId,
        amount: line.lineTotal,
      })),
    });
  }
}

/**
 * Grants the three holdings, one row per granting line.
 *
 * The `saleLineId` is what ties a holding to the sale that granted it, which is how
 * "this package came from sale 24418" stays answerable after the catalogue row is
 * renamed. Legacy reached the same row through a `sale_package_id` column that pointed
 * at a pivot table the rebuild removed.
 */
async function grantHoldings(
  tx: SaleTransaction,
  tenantId: string,
  saleId: string,
  customerId: string,
  priced: PricedLine[],
): Promise<void> {
  const granting = priced.filter((line) => GRANTING_KINDS.has(line.item.itemType));
  if (granting.length === 0) return;

  // The line ids were just written, in cart order, so `position` lines them up with
  // `priced` rather than re-querying per line.
  const stored = await tx.saleLine.findMany({
    where: { saleId },
    select: { id: true, position: true },
    orderBy: { position: "asc" },
  });

  for (const line of granting) {
    const lineId = stored[priced.indexOf(line)]?.id;
    if (!lineId) continue;
    const quantity = line.input.quantity;

    switch (line.item.itemType) {
      case "PACKAGE": {
        // Sessions granted scale with the quantity sold, and the remaining balance
        // starts equal to it — the whole grant is unspent at the moment of sale.
        const sessions = Number(line.item.grant) * quantity;
        await tx.customerPackageHolding.create({
          data: {
            tenantId,
            customerId,
            packageId: line.item.itemId,
            saleLineId: lineId,
            quantity: sessions,
            quantityRemaining: sessions,
          },
        });
        break;
      }

      case "VALUE_PACKAGE": {
        const credit = (line.item.grant as Prisma.Decimal).mul(quantity);
        await tx.customerValuePackageHolding.create({
          data: {
            tenantId,
            customerId,
            valuePackageId: line.item.itemId,
            saleLineId: lineId,
            amount: credit,
            amountRemaining: credit,
          },
        });
        break;
      }

      case "GIFT_CARD": {
        // The issued card inherits the template's expiry, so a card sold from a
        // six-month template expires in six months rather than never.
        const value = (line.item.grant as Prisma.Decimal).mul(quantity);
        await tx.customerGiftCardHolding.create({
          data: {
            tenantId,
            customerId,
            giftCardId: line.item.itemId,
            saleLineId: lineId,
            value,
            valueRemaining: value,
            expiresAt: line.item.expiresAt,
          },
        });
        break;
      }
    }
  }
}

/**
 * The transaction handle, as `$transaction` actually hands it over.
 *
 * Not `Prisma.TransactionClient`: `prisma` is the **extended** client (the tenant
 * scoping lives on it), and its interactive transaction carries those extensions, so
 * the bare namespace type does not describe what `tx` is. Reading the type off the call
 * is what keeps the two from drifting.
 */
type SaleTransaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** The receipt's own columns, plus the names a printed receipt shows. */
const SALE_SELECT = {
  id: true,
  receiptNumber: true,
  status: true,
  paymentStatus: true,
  soldAt: true,
  customerId: true,
  customer: { select: { name: true } },
  staffId: true,
  staff: { select: { name: true } },
  note: true,
  totalQuantity: true,
  totalAmount: true,
  paidAmount: true,
  // The points the ledger recorded, not a recomputation: the ledger is the record, so
  // a correction row written later moves this figure without touching the sale.
  points: { select: { point: true } },
  lines: {
    select: {
      id: true,
      itemType: true,
      itemId: true,
      itemName: true,
      quantity: true,
      unitPrice: true,
      lineTotal: true,
      staffId: true,
      staff: { select: { name: true } },
    },
    // Cart order, which is why `SaleLine.position` exists.
    orderBy: { position: "asc" },
  },
  payments: {
    select: { method: true, amount: true, sessionId: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.SaleSelect;

/** Serialises a sale row into the contract, parsing so a forgotten column throws. */
function toSaleDetail(row: Prisma.SaleGetPayload<{ select: typeof SALE_SELECT }>): SaleDetail {
  return saleDetailSchema.parse({
    id: row.id,
    receiptNumber: row.receiptNumber,
    status: row.status,
    paymentStatus: row.paymentStatus,
    soldAt: row.soldAt.toISOString(),
    customerId: row.customerId,
    customerName: row.customer?.name ?? null,
    staffId: row.staffId,
    staffName: row.staff?.name ?? null,
    note: row.note,
    totalQuantity: row.totalQuantity,
    totalAmount: amount(row.totalAmount),
    paidAmount: amount(row.paidAmount),
    // Never negative, for the same reason the write clamps it: overpayment is change.
    outstandingAmount: amount(Prisma.Decimal.max(row.totalAmount.minus(row.paidAmount), 0)),
    pointsEarned: row.points.reduce((sum, entry) => sum + entry.point, 0),
    lines: row.lines.map((line) => ({
      id: line.id,
      itemType: line.itemType,
      itemId: line.itemId,
      itemName: line.itemName,
      quantity: line.quantity,
      unitPrice: amount(line.unitPrice),
      lineTotal: amount(line.lineTotal),
      staffId: line.staffId,
      staffName: line.staff?.name ?? null,
    })),
    payments: row.payments.map((tender) => ({
      method: tender.method,
      amount: amount(tender.amount),
      sessionId: tender.sessionId,
    })),
  });
}

/**
 * `GET /api/sales/:id` — the receipt.
 *
 * The same shape `POST /api/sales` returns, because the confirmation screen **is** the
 * receipt rather than a second page built from a different set of numbers. A sale from
 * another salon is simply not found: the Prisma extension filters the lookup.
 */
export async function getSale(id: string): Promise<SaleDetail> {
  const row = await prisma.sale.findFirst({ where: { id }, select: SALE_SELECT });
  if (!row) throw notFound("That sale does not exist.", "SALE_NOT_FOUND");

  return toSaleDetail(row);
}

/**
 * Prisma's unique-constraint violation, as `staff.service.ts` spells it.
 *
 * Deliberately narrow: a bare `catch` that treats every error as "someone else won the
 * race" would swallow a genuine bug and answer it with the wrong sale.
 */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

/** The sale a key already produced, or `null`. Scoped, so it is this salon's own. */
function findByIdempotencyKey(key: string) {
  return prisma.sale.findFirst({ where: { idempotencyKey: key }, select: { id: true } });
}

/**
 * `POST /api/sales` — rings the sale up and returns its receipt.
 *
 * **Q16, idempotency.** Legacy's `pay-by-cash` posts a payment with no key anywhere,
 * so a double-tap on a slow connection charges twice. The client generates
 * `idempotencyKey` per attempt and this returns the sale that already exists rather
 * than writing a second one. The `@@unique([tenantId, idempotencyKey])` index is what
 * actually enforces it, which also covers two genuinely concurrent posts of one key:
 * the second loses the insert race and reads the winner's sale back.
 *
 * The key is optional because the legacy importer has none to give, and refusing it
 * there would break Phase 9 — an unkeyed write is simply not idempotent.
 */
export async function createSale(input: CreateSaleInput): Promise<SaleDetail> {
  const tenantId = requireTenantScope();

  const key = input.idempotencyKey;
  if (key !== undefined) {
    const replay = await findByIdempotencyKey(key);
    if (replay) return getSale(replay.id);
  }

  // A foreign customer is not found rather than forbidden: the extension scopes the
  // lookup, so this cannot tell "no such customer" from "not yours", and must not.
  const customer = input.customerId
    ? await prisma.customer.findFirst({
        where: { id: input.customerId },
        select: { id: true, memberId: true },
      })
    : null;
  if (input.customerId && !customer) {
    throw notFound("That customer does not exist.", "CUSTOMER_NOT_FOUND");
  }

  // A granting line needs an owner, or the credit is issued to nobody. Refused before
  // anything is written rather than as a foreign-key surprise mid-transaction.
  if (!customer && input.lines.some((line) => GRANTING_KINDS.has(line.itemType))) {
    throw badRequest("A package, value package or gift card needs a customer.", [
      { path: "body.customerId", message: "Required to sell something that grants credit." },
    ]);
  }

  // Checked before anything is written, so a cart naming a stranger fails whole rather
  // than as a foreign-key violation mid-transaction — or, worse, as a link that lands.
  await assertStaffExist(input);

  // "Is a member" is the membership reference legacy kept as free text
  // (`customers.member_id`). There is no membership table to join, so the presence of
  // the reference is the whole rule — inventing a tier model is a product decision this
  // slice does not get to make.
  const priced = await priceCart(input.lines, customer?.memberId != null);

  const customerId = customer?.id ?? null;
  try {
    return await getSale(await writeSale(tenantId, input, priced, customerId));
  } catch (error) {
    // The concurrent-double-post case: this call lost the unique index to one that has
    // already written the sale, so that sale exists and is the answer to this request.
    if (key !== undefined && isUniqueViolation(error)) {
      const winner = await findByIdempotencyKey(key);
      if (winner) return getSale(winner.id);
    }
    throw error;
  }
}
