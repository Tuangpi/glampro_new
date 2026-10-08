import { Router } from "express";
import { dashboardQuerySchema, type DashboardQuery } from "@glampro/shared";

import { auth } from "../middleware/auth.js";
import { requireModule } from "../middleware/requireModule.js";
import { validate, validated } from "../middleware/validate.js";
import { dashboardSummary } from "../services/report.service.js";

/**
 * Reports — handoff screen 05's tiles (`/api/reports`).
 *
 * Mounted behind `requireModule("dashboard")` rather than `requireModule("reports")`
 * because these reads are the **dashboard's**, which every salon has: `dashboard`
 * is core, so the guard's job here is the refusal shape and the tenant scope,
 * not the billing decision. The `reports` add-on guards the screen-10 tables
 * when they land, and the demo seed grants it now so that screen opens on a
 * fresh `db:reset` (`docs/mvp.md` → M3).
 */
export const reportsRouter = Router();

reportsRouter.get(
  "/dashboard",
  auth,
  requireModule("dashboard"),
  validate(dashboardQuerySchema, "query"),
  async (req, res, next) => {
    try {
      const query = validated<DashboardQuery>(req, "query");
      res.status(200).json({ data: await dashboardSummary(query) });
    } catch (error) {
      next(error);
    }
  },
);
