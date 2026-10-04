/**
 * Customer reads and writes — handoff screen 07, `GET /api/customers`.
 *
 * **Every function here runs inside the tenant scope `middleware/auth.ts` opened**,
 * so the Prisma extension supplies the `tenantId` filter and a handler naming
 * another salon's customer simply finds nothing. No function takes a tenant id as
 * an argument, and none reads one from the request: there is no code path by which
 * a caller can say which tenant to read (AGENTS.md rule 1, `docs/saas/TENANCY.md`).
 *
 * Rows are serialised **through the shared Zod schemas** rather than by hand. If a
 * field is added to `Customer` and forgotten here, `parse` throws instead of the
 * browser receiving a shape its contract does not describe — the two sides cannot
 * drift silently (AGENTS.md rule 6).
 */
import type { PaginatedResponse } from "@glampro/shared";
import {
  customerDetailSchema,
  customerSummarySchema,
  type CreateCustomerInput,
  type CustomerDetail,
  type CustomerListQuery,
  type CustomerSummary,
  type UpdateCustomerInput,
} from "@glampro/shared";

import { notFound, validationFailed } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { paginated, parsePagination } from "../utils/pagination.js";

/**
 * Columns the screen needs. `passwordHash`, `otpHash` and `otpExpiresAt` are
 * deliberately absent — a customer can sign in to the mobile app, so those columns
 * exist, and a `select *` would put them in a list response.
 */
const CUSTOMER_SELECT = {
  id: true,
  code: true,
  name: true,
  memberId: true,
  email: true,
  phone: true,
  gender: true,
  dateOfBirth: true,
  address: true,
  comment: true,
  createdAt: true,
  updatedAt: true,
  hairCardNumber: true,
  maniCardNumber: true,
  cardNumber: true,
  departments: { select: { department: { select: { id: true, name: true } } } },
} as const;

/**
 * Reads the columns a row is displayed from.
 *
 * The row type is inferred from this query rather than declared, so a field added
 * to `CUSTOMER_SELECT` cannot be missing from the type that serialises it.
 */
function findRow(id: string) {
  return prisma.customer.findFirst({ where: { id }, select: CUSTOMER_SELECT });
}

type CustomerRow = NonNullable<Awaited<ReturnType<typeof findRow>>>;

/** `YYYY-MM-DD` in UTC. The contract says `z.iso.date()`, not a timestamp. */
function toIsoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/** A `YYYY-MM-DD` string to a UTC midnight `Date`; `null` clears, `undefined` skips. */
function fromIsoDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  return value === null ? null : new Date(`${value}T00:00:00.000Z`);
}

function toSummary(row: CustomerRow): CustomerSummary {
  return customerSummarySchema.parse({
    id: row.id,
    code: row.code,
    name: row.name,
    memberId: row.memberId,
    email: row.email,
    phone: row.phone,
    gender: row.gender,
    dateOfBirth: toIsoDate(row.dateOfBirth),
    address: row.address,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function toDetail(row: CustomerRow): CustomerDetail {
  return customerDetailSchema.parse({
    ...toSummary(row),
    hairCardNumber: row.hairCardNumber,
    maniCardNumber: row.maniCardNumber,
    cardNumber: row.cardNumber,
    departments: row.departments.map((link) => link.department),
  });
}

/**
 * Refuses branch ids that are not this salon's.
 *
 * `Department` is tenant-scoped, so this query cannot see another tenant's rows and
 * a forged id fails the comparison rather than creating a cross-tenant link row.
 */
async function assertDepartmentsExist(ids: string[] | undefined): Promise<void> {
  if (!ids || ids.length === 0) return;

  const wanted = [...new Set(ids)];
  const found = await prisma.department.findMany({
    where: { id: { in: wanted } },
    select: { id: true },
  });

  if (found.length !== wanted.length) {
    throw validationFailed([
      { path: "body.departmentIds", message: "One or more selected branches do not exist." },
    ]);
  }
}

/**
 * Writes the customer↔branch links.
 *
 * `createMany` rather than a nested `create`, because the extension injects
 * `tenantId` into the payload it is given and cannot reach into a nested create —
 * `CustomerDepartment.tenantId` would be left unset.
 */
async function replaceDepartments(
  customerId: string,
  departmentIds: string[] | undefined,
): Promise<void> {
  await prisma.customerDepartment.deleteMany({ where: { customerId } });
  if (!departmentIds || departmentIds.length === 0) return;

  await prisma.customerDepartment.createMany({
    data: [...new Set(departmentIds)].map((departmentId) => ({
      // Placeholder: `scopeCreateManyData` overwrites it with the scope's tenant.
      tenantId: "",
      customerId,
      departmentId,
    })),
  });
}

/** One page of customers, by name, with the server-side total. */
export async function listCustomers(
  query: CustomerListQuery,
): Promise<PaginatedResponse<CustomerSummary>> {
  const { page, pageSize, skip, take } = parsePagination(query);

  // The screen's own placeholder is "Search name or phone…", so one box matches
  // either field rather than making the user pick which one they typed into.
  const where = {
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" as const } },
            { phone: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(query.memberId ? { memberId: query.memberId } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      select: CUSTOMER_SELECT,
      // `id` breaks ties so paging is stable when two customers share a name.
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip,
      take,
    }),
    prisma.customer.count({ where }),
  ]);

  return paginated(rows.map(toSummary), total, { page, pageSize });
}

export async function getCustomer(id: string): Promise<CustomerDetail> {
  const row = await findRow(id);
  if (!row) throw notFound("That customer does not exist.", "CUSTOMER_NOT_FOUND");
  return toDetail(row);
}

export async function createCustomer(input: CreateCustomerInput): Promise<CustomerDetail> {
  const { departmentIds, dateOfBirth, ...fields } = input;
  await assertDepartmentsExist(departmentIds);

  const created = await prisma.customer.create({
    data: {
      // Placeholder: `scopeCreateData` overwrites it with the scope's tenant, so a
      // handler cannot place a row in another salon even if it tried.
      tenantId: "",
      ...fields,
      dateOfBirth: fromIsoDate(dateOfBirth) ?? null,
    },
    select: CUSTOMER_SELECT,
  });

  await replaceDepartments(created.id, departmentIds);
  return getCustomer(created.id);
}

/**
 * Applies a partial update.
 *
 * An absent field is left alone and an explicit `null` clears it —
 * `updateCustomerSchema` distinguishes the two, and spreading `fields` preserves
 * that, because Prisma skips `undefined` and writes `null`.
 */
export async function updateCustomer(
  id: string,
  input: UpdateCustomerInput,
): Promise<CustomerDetail> {
  const { departmentIds, dateOfBirth, ...fields } = input;
  await assertDepartmentsExist(departmentIds);

  const existing = await prisma.customer.findFirst({ where: { id }, select: { id: true } });
  if (!existing) throw notFound("That customer does not exist.", "CUSTOMER_NOT_FOUND");

  await prisma.customer.update({
    where: { id },
    data: {
      ...fields,
      ...(dateOfBirth !== undefined ? { dateOfBirth: fromIsoDate(dateOfBirth) } : {}),
    },
  });

  if (departmentIds !== undefined) {
    await replaceDepartments(id, departmentIds);
  }

  return getCustomer(id);
}
