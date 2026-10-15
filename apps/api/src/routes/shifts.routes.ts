import { Router } from "express";
import {
  createShiftSchema,
  idParamSchema,
  shiftListQuerySchema,
  updateShiftSchema,
  type CreateShiftInput,
  type ShiftListQuery,
  type UpdateShiftInput,
} from "@glampro_suite/shared";

import { auth, requireRole, requireWritableTenant } from "../middleware/auth.js";
import { requireModule } from "../middleware/requireModule.js";
import { validate, validated } from "../middleware/validate.js";
import { unauthorized } from "../lib/http-error.js";
import { createShift, getShift, listShifts, updateShift } from "../services/shift.service.js";

/**
 * Staff shifts — the rota behind handoff screens 06 and 09, `/api/shifts`.
 *
 * Guarded by `staff`, not `appointments`, even though the calendar is the screen
 * that draws it: a rota is a fact about **who works when**, which is a staff
 * record, and the calendar is one of its readers. Both are core modules, so what
 * this really buys is the tenant context plus the same 403 shape as every other
 * route.
 *
 * **Writes are `SUPER_ADMIN` or `MANAGER`**, the same rule `staff.routes.ts`
 * mounts: a rota is a management decision, and a stylist must not be able to put
 * themselves on shift or lengthen their own day. Reads stay open to every
 * signed-in member, because a person needs to see their own hours.
 *
 * There is deliberately **no `DELETE`**: a shift is withdrawn by editing its
 * `effectiveTo`, not by removing the row. A deleted rota row would erase the
 * record of what the salon once published, which is exactly the history a dispute
 * about hours turns on — the same reason appointments cancel rather than delete.
 */
export const shiftsRouter = Router();

shiftsRouter.get(
  "/",
  auth,
  requireModule("staff"),
  validate(shiftListQuerySchema, "query"),
  async (req, res, next) => {
    try {
      const query = validated<ShiftListQuery>(req, "query");
      res.status(200).json({ data: await listShifts(query) });
    } catch (error) {
      next(error);
    }
  },
);

shiftsRouter.get(
  "/:id",
  auth,
  requireModule("staff"),
  validate(idParamSchema, "params"),
  async (req, res, next) => {
    try {
      const { id } = validated<{ id: string }>(req, "params");
      res.status(200).json({ data: await getShift(id) });
    } catch (error) {
      next(error);
    }
  },
);

shiftsRouter.post(
  "/",
  auth,
  requireModule("staff"),
  requireWritableTenant(),
  requireRole("SUPER_ADMIN", "MANAGER"),
  validate(createShiftSchema),
  async (req, res, next) => {
    try {
      if (!req.user) throw unauthorized();

      const input = validated<CreateShiftInput>(req, "body");
      res.status(201).json({ data: await createShift(input) });
    } catch (error) {
      next(error);
    }
  },
);

shiftsRouter.patch(
  "/:id",
  auth,
  requireModule("staff"),
  requireWritableTenant(),
  requireRole("SUPER_ADMIN", "MANAGER"),
  validate(idParamSchema, "params"),
  validate(updateShiftSchema),
  async (req, res, next) => {
    try {
      if (!req.user) throw unauthorized();

      const { id } = validated<{ id: string }>(req, "params");
      const input = validated<UpdateShiftInput>(req, "body");
      res.status(200).json({ data: await updateShift(id, input) });
    } catch (error) {
      next(error);
    }
  },
);
