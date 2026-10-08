/**
 * Reports — handoff screen 05's tiles, `/api/reports`.
 *
 * The phase's full report catalogue, export and charts are still ahead of this
 * file (`docs/roadmap.md` → Phase 7); what exists today is the dashboard's
 * four numbers, and they are here rather than in four bespoke endpoints
 * because they are **one question asked of one window**: how was today.
 *
 * Every figure is a tenant-scoped aggregate the server counts — the browser
 * never sums the page of rows it happens to hold (ADR 0010). Runs inside the
 * tenant scope `middleware/auth.ts` opened; no function takes a tenant id.
 */
import {
  dashboardSummarySchema,
  type DashboardQuery,
  type DashboardSummary,
} from "@glampro/shared";

import { prisma } from "../lib/prisma.js";
import { resolveLowStockThreshold } from "./catalogue.service.js";

/** A `Decimal(12,2)` on the wire is a string, so no cent is lost to a float. */
function money(value: { toFixed: (digits: number) => string } | null): string {
  return value ? value.toFixed(2) : "0.00";
}

/**
 * The server's current day, for a caller that sent no edges — a `curl` against
 * the endpoint still answers. The browser always sends its own edges (see
 * `dashboardQuerySchema`), so this fallback is the unusual case rather than
 * the one the dashboard depends on.
 */
function serverDay(): { from: Date; to: Date } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { from, to };
}

function windowOf(query: DashboardQuery): { from: Date | undefined; to: Date | undefined } {
  const fallback = serverDay();
  return {
    from: query.from ? new Date(query.from) : fallback.from,
    to: query.to ? new Date(query.to) : fallback.to,
  };
}

/**
 * The four tiles, counted in one pass.
 *
 * All three windowed counts use the same `gte`/`lte` pair, because the client's
 * `to` is the last instant of the day rather than the next midnight, and one
 * rule across all three is what stops the income tile and the appointment tile
 * from disagreeing about whether 23:59:59 falls inside the day.
 */
export async function dashboardSummary(query: DashboardQuery): Promise<DashboardSummary> {
  const { from, to } = windowOf(query);

  const window = {
    ...(from ? { gte: from } : {}),
    ...(to ? { lte: to } : {}),
  };

  const [sales, appointments, newCustomers, threshold] = await Promise.all([
    prisma.sale.aggregate({
      where: { status: "COMPLETED", soldAt: window },
      _sum: { paidAmount: true },
      _count: { _all: true },
    }),
    prisma.appointment.count({
      // A cancelled booking did not happen; everything else in the window —
      // including a no-show — is a slot the salon held and is shown as one.
      where: { startsAt: window, status: { not: "CANCELLED" } },
    }),
    prisma.customer.count({ where: { createdAt: window } }),
    resolveLowStockThreshold(),
  ]);

  const lowStock = await prisma.product.count({
    where: { quantity: { lte: threshold } },
  });

  return dashboardSummarySchema.parse({
    incomeToday: money(sales._sum.paidAmount),
    salesToday: sales._count._all,
    appointmentsToday: appointments,
    newCustomersToday: newCustomers,
    lowStock,
    asOf: new Date().toISOString(),
  });
}
