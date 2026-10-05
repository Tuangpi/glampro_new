/**
 * Branches (the `Department` table) — the picker behind every catalogue and staff
 * form, served by `GET /api/departments`.
 *
 * It lives in its own module rather than inside `catalogue.service.ts` because it
 * is not catalogue-specific: staff, and later appointments and reports, all need
 * the same list. `assertDepartmentsExist` is here for the same reason — the
 * check that a submitted branch id belongs to the caller's salon is one rule, and
 * four callers were about to grow four copies of it.
 *
 * Reads run in the tenant scope `middleware/auth.ts` opened, so `Department` being
 * tenant-scoped means a foreign branch id simply is not found.
 */
import { departmentSchema, type DepartmentSummary } from "@glampro/shared";

import { validationFailed } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";

/** Every branch in the caller's salon, by name. Never paginated — a salon has few. */
export async function listDepartments(): Promise<DepartmentSummary[]> {
  const rows = await prisma.department.findMany({
    select: { id: true, name: true },
    // `id` breaks ties so the picker's order is stable across requests.
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });

  return rows.map((row) => departmentSchema.parse({ id: row.id, name: row.name }));
}

/**
 * Refuses branch ids that are not this salon's.
 *
 * `Department` is tenant-scoped, so this query cannot see another tenant's rows
 * and a forged id fails the count rather than creating a cross-tenant link row.
 * Throwing `validationFailed` rather than `notFound` is what lets the form put the
 * message on the branch control: `details[].path` names the field.
 *
 * `path` defaults to the plural form the customer form uses; a caller taking a
 * single `departmentId` passes `"body.departmentId"`.
 */
export async function assertDepartmentsExist(
  ids: string[] | undefined,
  path = "body.departmentIds",
): Promise<void> {
  if (!ids || ids.length === 0) return;

  const wanted = [...new Set(ids)];
  const found = await prisma.department.findMany({
    where: { id: { in: wanted } },
    select: { id: true },
  });

  if (found.length !== wanted.length) {
    throw validationFailed([
      {
        path,
        message:
          path === "body.departmentIds"
            ? "One or more selected branches do not exist."
            : "That branch does not exist.",
      },
    ]);
  }
}

/**
 * The single-branch form of the check, for the optional `departmentId` on a
 * product or a service.
 *
 * `null` and `undefined` both pass: one clears the field, the other leaves it
 * alone, and neither names a branch that could be missing.
 */
export async function assertDepartmentExists(
  id: string | null | undefined,
  path = "body.departmentId",
): Promise<void> {
  if (id === null || id === undefined) return;
  await assertDepartmentsExist([id], path);
}

/**
 * The ids of the branches a user is linked to, for the staff list.
 *
 * Kept here so `staff.service.ts` does not have to reach into `StaffDepartment`
 * itself for a read that is really about departments.
 */
export async function departmentIdsForUser(userId: string): Promise<string[]> {
  const links = await prisma.staffDepartment.findMany({
    where: { userId },
    select: { departmentId: true },
  });

  return links.map((link) => link.departmentId);
}
