/**
 * Report contracts — handoff screen 05's tiles and (later) screen 10's tables.
 *
 * This file starts with the one shape the dashboard needs: four numbers the
 * **server** counted. Every tile on screen 05 is a tenant-scoped aggregate, so
 * the browser never derives a figure from the page of rows it happens to hold
 * (ADR 0010) — and "today's income" is a sum over `Sale`, which no list screen
 * would ever hold in full.
 *
 * Money is a **string on the wire**, like every other `Decimal(12,2)` in the
 * package: a JSON float has already lost the cent the till just charged.
 */
import { z } from "zod";

/**
 * `GET /api/reports/dashboard?from=&to=`
 *
 * One request for all four tiles rather than four endpoints: they are answered
 * in one pass over the same window, so the income figure and the count behind
 * it can never be observed a minute apart and disagree.
 *
 * `from`/`to` are the day's edges as the browser's clock draws them (the same
 * rule the appointment list keeps): "today" is the salon's day, and the
 * salon's timezone is not a column the schema has, so the screen sends the
 * instants rather than asking the server to guess them. Omitted, they default
 * to the server's current day — a `curl` against the endpoint still answers.
 *
 * `salesToday` counts the receipts `incomeToday` sums — the tile draws "$X in
 * N sales" from one row, and a count computed in the browser would be N−1
 * whenever a sale landed between two requests.
 */
export const dashboardQuerySchema = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

export const dashboardSummarySchema = z.object({
  /** Takings for today, `paidAmount` over completed sales. `"0.00"` when none. */
  incomeToday: z.string(),
  /** Receipts behind `incomeToday`. */
  salesToday: z.number().int().min(0),
  /** Bookings starting today, excluding the ones cancelled before they happened. */
  appointmentsToday: z.number().int().min(0),
  /** Customers whose row was created today. */
  newCustomersToday: z.number().int().min(0),
  /** Products at or below the tenant's own threshold (ADR 0010). */
  lowStock: z.number().int().min(0),
  /** When the API counted — ISO 8601, so the screen can say "as of 14:02". */
  asOf: z.string(),
});

export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
