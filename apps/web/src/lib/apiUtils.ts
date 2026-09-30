import type { PaginatedResponse } from "@glampro/shared";

/**
 * Accepts the several list shapes the API has historically returned and
 * normalises them into one `PaginatedResponse`.
 *
 * Handles:
 *   { data: [...], total, page, pageSize, pageCount }   ← current shape
 *   { data: [...], total, currentPage, totalPages }     ← legacy paging
 *   { items: [...] } / { rows: [...] }                  ← bare collections
 */
export function normalisePaginated<T>(
  raw: Record<string, unknown> | undefined,
  dataKey = "data",
): PaginatedResponse<T> {
  const source = raw ?? {};
  const candidate = source[dataKey] ?? source["items"] ?? source["rows"];
  const data = Array.isArray(candidate) ? (candidate as T[]) : [];

  const total = asNumber(source["total"], data.length);
  const pageSize = asNumber(source["pageSize"] ?? source["perPage"], data.length || total);
  const page = asNumber(source["page"] ?? source["currentPage"], 1);
  const pageCount = asNumber(
    source["pageCount"] ?? source["totalPages"],
    pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  );

  return { data, total, page, pageSize, pageCount };
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}
