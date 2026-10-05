import { Router } from "express";

import { auth } from "../middleware/auth.js";
import { requireModule } from "../middleware/requireModule.js";
import { listDepartments } from "../services/department.service.js";

/**
 * Branches — the picker behind every catalogue and staff form.
 *
 * **Read-only on purpose.** A branch is created with the salon, during onboarding,
 * and no screen in the handoff manages them: `POST`/`PATCH` here would be an API
 * with no caller. They arrive with the screen that needs them, which is how the rest
 * of this build has handled endpoints whose UI does not exist yet.
 *
 * Guarded by `catalogue` rather than a module of its own, because there is no
 * `departments` module code to guard it with. Both callers — the catalogue forms and
 * the staff form — are core modules, so what this really buys is the tenant context
 * `requireModule` insists on (a branch list is meaningless without a salon) plus the
 * same 403 shape as every other route. It is deliberately not `packages` or another
 * add-on: a picker that a form cannot load would be a worse failure than a shared
 * boundary.
 */
export const departmentsRouter = Router();

departmentsRouter.get("/", auth, requireModule("catalogue"), async (_req, res, next) => {
  try {
    res.status(200).json({ data: await listDepartments() });
  } catch (error) {
    next(error);
  }
});
