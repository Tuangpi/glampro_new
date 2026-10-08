import { Router } from "express";
import {
  appointmentListQuerySchema,
  createAppointmentSchema,
  idParamSchema,
  updateAppointmentSchema,
  type AppointmentListQuery,
  type CreateAppointmentInput,
  type UpdateAppointmentInput,
} from "@glampro/shared";

import { auth, requireWritableTenant } from "../middleware/auth.js";
import { requireModule } from "../middleware/requireModule.js";
import { validate, validated } from "../middleware/validate.js";
import { unauthorized } from "../lib/http-error.js";
import {
  createAppointment,
  getAppointment,
  listAppointments,
  updateAppointment,
} from "../services/appointment.service.js";

/**
 * Appointments — handoff screens 03 and 06 (`/api/appointments`).
 *
 * Reads are open to every signed-in member of the salon (the rail entry is
 * unrestricted — a stylist needs their own day); writes additionally require a
 * writable tenant, because a `SUSPENDED` salon may look at its book but must
 * not change it (`docs/saas/TENANCY.md` §6).
 *
 * `requireModule("appointments")` is the entitlement boundary — hiding the
 * rail entry is a convenience, this is the rule. `appointments` is a core
 * module, so a tenant that exists passes it.
 *
 * There is deliberately no `DELETE`: cancelling **is** the exit, the same way
 * `disabled` is the archive on staff. A deleted booking would take the day's
 * history with it, and "why did this not happen" is exactly the question the
 * status column exists to answer.
 */
export const appointmentsRouter = Router();

appointmentsRouter.get(
  "/",
  auth,
  requireModule("appointments"),
  validate(appointmentListQuerySchema, "query"),
  async (req, res, next) => {
    try {
      const query = validated<AppointmentListQuery>(req, "query");
      res.status(200).json({ data: await listAppointments(query) });
    } catch (error) {
      next(error);
    }
  },
);

appointmentsRouter.get(
  "/:id",
  auth,
  requireModule("appointments"),
  validate(idParamSchema, "params"),
  async (req, res, next) => {
    try {
      const { id } = validated<{ id: string }>(req, "params");
      res.status(200).json({ data: await getAppointment(id) });
    } catch (error) {
      next(error);
    }
  },
);

appointmentsRouter.post(
  "/",
  auth,
  requireModule("appointments"),
  requireWritableTenant(),
  validate(createAppointmentSchema),
  async (req, res, next) => {
    try {
      if (!req.user) throw unauthorized();

      const input = validated<CreateAppointmentInput>(req, "body");
      res.status(201).json({ data: await createAppointment(input) });
    } catch (error) {
      next(error);
    }
  },
);

appointmentsRouter.patch(
  "/:id",
  auth,
  requireModule("appointments"),
  requireWritableTenant(),
  validate(idParamSchema, "params"),
  validate(updateAppointmentSchema),
  async (req, res, next) => {
    try {
      if (!req.user) throw unauthorized();

      const { id } = validated<{ id: string }>(req, "params");
      const input = validated<UpdateAppointmentInput>(req, "body");
      res.status(200).json({ data: await updateAppointment(id, input) });
    } catch (error) {
      next(error);
    }
  },
);
