/**
 * Gift cards — the fourth tab of handoff screen 08, `/api/gift-cards`.
 *
 * The row here is the **template** the salon sells, not the card a customer holds:
 * issuing one writes a `CustomerGiftCardHolding`, which is where the customer and
 * the money owed live. Legacy drew the same line — `giftcards` was the shelf item and
 * `customer_giftcards` the issued card.
 *
 * `giftCards` is an add-on module code, so the mount carries its own entitlement. As
 * everywhere else, every function runs in the tenant scope `middleware/auth.ts`
 * opened and rows are serialised through the shared Zod schemas.
 */
import {
  giftCardDetailSchema,
  type CatalogueListQuery,
  type CreateGiftCardInput,
  type GiftCardDetail,
  type GiftCardSummary,
  type PaginatedResponse,
  type UpdateGiftCardInput,
} from "@glampro/shared";

import { notFound } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { paginated, parsePagination } from "../utils/pagination.js";

/** The columns the tab and the editor read. There is no `status` to select. */
const GIFT_CARD_SELECT = {
  id: true,
  name: true,
  value: true,
  expiresAt: true,
  remark: true,
  qrPayload: true,
  createdAt: true,
  updatedAt: true,
} as const;

function findGiftCardRow(id: string) {
  return prisma.giftCard.findFirst({ where: { id }, select: GIFT_CARD_SELECT });
}

type GiftCardRow = NonNullable<Awaited<ReturnType<typeof findGiftCardRow>>>;

/** A `Decimal(12,2)` on the wire is a string, so no cent is lost to a float. */
function money(value: { toFixed: (digits: number) => string }): string {
  return value.toFixed(2);
}

function toGiftCard(row: GiftCardRow): GiftCardSummary {
  return giftCardDetailSchema.parse({
    id: row.id,
    name: row.name,
    value: money(row.value),
    // `null` is "never expires", which is why it is not defaulted to today: a card
    // with no expiry is a real product, and legacy stored `expired_date` as text
    // precisely because it was allowed to be absent (Q6).
    expiresAt: row.expiresAt === null ? null : row.expiresAt.toISOString(),
    remark: row.remark,
    qrPayload: row.qrPayload,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

/**
 * The filter this list applies.
 *
 * One search box matches the name or the remark, like the other tabs.
 * `?status=` is **ignored rather than rejected** — `GiftCard` has no status column,
 * so there is no state to filter on and the tab draws no Status cell — and so are
 * `?departmentId=` and `?lowStock=`. All four tabs share one toolbar and one query
 * string; the same arrangement lets a service ignore `?lowStock`.
 */
function giftCardWhere(query: CatalogueListQuery) {
  return {
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" as const } },
            { remark: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

/** One page of gift cards, by name, with the server-side total. */
export async function listGiftCards(
  query: CatalogueListQuery,
): Promise<PaginatedResponse<GiftCardSummary>> {
  const { page, pageSize, skip, take } = parsePagination(query);
  const where = giftCardWhere(query);

  const [rows, total] = await Promise.all([
    prisma.giftCard.findMany({
      where,
      select: GIFT_CARD_SELECT,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip,
      take,
    }),
    prisma.giftCard.count({ where }),
  ]);

  return paginated(rows.map(toGiftCard), total, { page, pageSize });
}

export async function getGiftCard(id: string): Promise<GiftCardDetail> {
  const row = await findGiftCardRow(id);
  if (!row) throw notFound("That gift card does not exist.", "GIFT_CARD_NOT_FOUND");

  return toGiftCard(row);
}

export async function createGiftCard(input: CreateGiftCardInput): Promise<GiftCardDetail> {
  const created = await prisma.giftCard.create({
    data: {
      // Placeholder: `scopeCreateData` overwrites it with the scope's tenant.
      tenantId: "",
      name: input.name,
      value: input.value,
      // A date-only input, stored as UTC midnight — the day is the fact, and the
      // editor renders back the date part.
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      remark: input.remark ?? null,
      qrPayload: input.qrPayload ?? null,
    },
    select: { id: true },
  });

  return getGiftCard(created.id);
}

/**
 * Applies a partial update.
 *
 * An absent field is left alone; `null` clears one. `expiresAt` needs the explicit
 * translation below because the contract's `null` means "never expires" while
 * Prisma's means the same thing only if it reaches the column as a real `null` — and
 * `undefined` must not be sent at all, or an edit that did not mention the date
 * would wipe it.
 */
export async function updateGiftCard(
  id: string,
  input: UpdateGiftCardInput,
): Promise<GiftCardDetail> {
  const { expiresAt, ...fields } = input;

  const existing = await prisma.giftCard.findFirst({ where: { id }, select: { id: true } });
  if (!existing) throw notFound("That gift card does not exist.", "GIFT_CARD_NOT_FOUND");

  await prisma.giftCard.update({
    where: { id },
    data: {
      ...fields,
      ...(expiresAt !== undefined
        ? { expiresAt: expiresAt === null ? null : new Date(expiresAt) }
        : {}),
    },
  });

  return getGiftCard(id);
}
