import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, type PaginatedResponse } from "@glampro/shared";

export interface Pagination {
  page: number;
  pageSize: number;
  /** Value for Prisma's `skip`. */
  skip: number;
  /** Value for Prisma's `take`. */
  take: number;
}

/**
 * Normalises `?page=&pageSize=` from an untrusted query string.
 * Invalid values fall back to the defaults rather than erroring, which keeps
 * table UIs resilient while `validate(paginationQuerySchema)` still rejects
 * genuinely malformed input at the route boundary.
 */
export function parsePagination(query: { page?: unknown; pageSize?: unknown } = {}): Pagination {
  const page = clamp(toPositiveInt(query.page) ?? 1, 1, Number.MAX_SAFE_INTEGER);
  const pageSize = clamp(toPositiveInt(query.pageSize) ?? DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);

  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** Wraps a page of rows in the envelope every list endpoint returns. */
export function paginated<T>(
  data: T[],
  total: number,
  { page, pageSize }: Pick<Pagination, "page" | "pageSize">,
): PaginatedResponse<T> {
  return {
    data,
    total,
    page,
    pageSize,
    pageCount: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
}

function toPositiveInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
