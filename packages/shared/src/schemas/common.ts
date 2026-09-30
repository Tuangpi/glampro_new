import { z } from "zod";

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants.js";

/** List endpoints accept `?page=&pageSize=` and coerce them to numbers. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Free-text search used by the POS item grid and every list toolbar. */
export const searchQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
});

export const idParamSchema = z.object({
  id: z.string().min(1).max(64),
});

export const emailSchema = z.email().max(255);

export const moneySchema = z.coerce.number().finite().min(0).max(99_999_999);
