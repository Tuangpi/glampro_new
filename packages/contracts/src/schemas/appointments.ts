import { z } from 'zod';
import { apiEnvelopeSchema } from './api.js';
import { locationSummarySchema } from './organization.js';
import {
  customerNoteAuthorSchema,
  customerSummarySchema,
  dateOnlySchema,
  staffProfileSummarySchema,
} from './people.js';

/**
 * Appointments.
 *
 * An appointment is one visit at one location, performed by one staff member,
 * with one or more services. The customer, staff profile, and location travel as
 * the same shapes their own modules return, so the calendar does not invent a
 * second projection for people the other screens already describe.
 *
 * Each `AppointmentService` row snapshots the name, duration, and price used at
 * booking time. Editing the catalog later must not rewrite what was agreed, and
 * the appointment's own times and totals come from those snapshots rather than
 * from the live `Service`.
 */

export const appointmentStatuses = [
  'SCHEDULED',
  'CONFIRMED',
  'CHECKED_IN',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;

export const appointmentStatusSchema = z.enum(appointmentStatuses);

/**
 * Statuses whose window still belongs to the calendar. A `COMPLETED`,
 * `CANCELLED`, or `NO_SHOW` appointment releases its time, which is what lets
 * availability offer the slot again.
 */
export const occupyingAppointmentStatuses = [
  'SCHEDULED',
  'CONFIRMED',
  'CHECKED_IN',
  'IN_PROGRESS',
] as const satisfies readonly (typeof appointmentStatuses)[number][];

/**
 * The transitions the calendar accepts. The web client offers only these as
 * actions; the API re-checks them, because the client is not the authority.
 *
 * A step may be skipped — a walk-in booked and finished in one go goes straight
 * from `SCHEDULED` to `COMPLETED` — but nothing moves backwards, and a completed,
 * cancelled, or no-show visit accepts nothing further.
 */
export const appointmentStatusTransitions: Record<
  (typeof appointmentStatuses)[number],
  readonly (typeof appointmentStatuses)[number][]
> = {
  SCHEDULED: ['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'],
  CONFIRMED: ['CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

const idSchema = z.string().trim().min(1).max(64);
const appointmentNotesSchema = z.string().trim().max(1000);
const appointmentServiceIdsSchema = z.array(idSchema).min(1).max(20);

/**
 * A list of ids in a query string arrives either as a repeated value
 * (`serviceIds=a&serviceIds=b`) or as one comma-separated value
 * (`serviceIds=a,b`), and both have to parse the same way.
 */
const idListFromQuery = (maximum: number) =>
  z.preprocess(
    (value) =>
      typeof value === 'string'
        ? value
            .split(',')
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0)
        : value,
    z.array(idSchema).min(1).max(maximum),
  );

export const createAppointmentRequestSchema = z.object({
  locationId: idSchema,
  customerId: idSchema,
  staffProfileId: idSchema,
  /** At least one service: the visit's duration comes from the snapshots. */
  serviceIds: appointmentServiceIdsSchema,
  startsAt: z.iso.datetime(),
  notes: appointmentNotesSchema.nullish(),
});

/**
 * Partial update for the booking itself. The service set is replaced through
 * `PUT /appointments/:id/services`, because a different set changes the
 * appointment's duration and therefore its end time.
 */
export const updateAppointmentRequestSchema = z
  .object({
    locationId: idSchema.optional(),
    staffProfileId: idSchema.optional(),
    startsAt: z.iso.datetime().optional(),
    notes: appointmentNotesSchema.nullish(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one field to update',
  });

export const replaceAppointmentServicesRequestSchema = z.object({
  serviceIds: appointmentServiceIdsSchema,
});

export const changeAppointmentStatusRequestSchema = z.object({
  status: appointmentStatusSchema,
  reason: z.string().trim().max(255).nullish(),
});

/**
 * Calendar reads. A `date` (with the `locationId` that owns the time zone)
 * selects one local day and echoes the resolved window back; `from`/`to` select
 * an explicit instant range; with neither, the most recent appointments are
 * returned, which is what the customer visit history asks for.
 */
export const appointmentQuerySchema = z
  .object({
    date: dateOnlySchema.optional(),
    locationId: idSchema.optional(),
    staffProfileId: idSchema.optional(),
    customerId: idSchema.optional(),
    status: appointmentStatusSchema.optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
  })
  .refine((value) => value.date === undefined || value.locationId !== undefined, {
    message: 'A date needs a locationId, because the day depends on the location time zone',
  })
  .refine((value) => (value.from === undefined) === (value.to === undefined), {
    message: 'Provide from and to together',
  })
  .refine((value) => value.from === undefined || value.from < (value.to ?? ''), {
    message: 'The end of the range must be after its start',
  })
  .refine((value) => value.date === undefined || value.from === undefined, {
    message: 'Provide either a date or a from/to range, not both',
  });

/**
 * Availability is asked per staff member, because the answer comes from one
 * person's week. Either name the services (their combined snapshot duration is
 * used) or pass an explicit duration for a what-if.
 */
export const availabilityQuerySchema = z
  .object({
    locationId: idSchema,
    staffProfileId: idSchema,
    date: dateOnlySchema,
    serviceIds: idListFromQuery(20).optional(),
    durationMinutes: z.coerce.number().int().min(5).max(1440).optional(),
    /** Step between offered slots; the whole visit must fit in the window. */
    slotMinutes: z.coerce.number().int().min(5).max(120).default(15),
  })
  .refine((value) => value.serviceIds !== undefined || value.durationMinutes !== undefined, {
    message: 'Provide serviceIds or durationMinutes',
  });

export const appointmentServiceSummarySchema = z.object({
  id: z.string().min(1),
  serviceId: z.string().min(1),
  name: z.string().min(1),
  durationMinutes: z.number().int().min(0).max(1_440),
  priceInCents: z.number().int().min(0).max(1_000_000_000),
  sortOrder: z.number().int().min(0).max(10_000),
});

export const appointmentActorSchema = customerNoteAuthorSchema;

export const appointmentStatusHistorySchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  appointmentId: z.string().min(1),
  /** Null on the row that records the booking itself. */
  fromStatus: appointmentStatusSchema.nullable(),
  toStatus: appointmentStatusSchema,
  reason: z.string().nullable(),
  changedById: z.string().nullable(),
  changedBy: appointmentActorSchema.nullable(),
  createdAt: z.iso.datetime(),
});

export const appointmentWindowSchema = z.object({
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
});

export const availabilitySlotSchema = z.object({
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
});

export const appointmentSummarySchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  locationId: z.string().min(1),
  customerId: z.string().min(1),
  staffProfileId: z.string().min(1),
  status: appointmentStatusSchema,
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  notes: z.string().nullable(),
  cancelledAt: z.iso.datetime().nullable(),
  cancellationReason: z.string().nullable(),
  createdById: z.string().nullable(),
  /** Totals derived from the service snapshots, not from the live catalog. */
  durationMinutes: z.number().int().min(0).max(1_440),
  priceInCents: z.number().int().min(0).max(1_000_000_000),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  services: z.array(appointmentServiceSummarySchema),
  customer: customerSummarySchema,
  staff: staffProfileSummarySchema,
  location: locationSummarySchema,
});

/** The detail read adds the status trail the appointment screen renders. */
export const appointmentDetailSchema = appointmentSummarySchema.extend({
  statusHistory: z.array(appointmentStatusHistorySchema),
});

export const appointmentsDataSchema = z.object({
  appointments: z.array(appointmentSummarySchema),
  /** The resolved local day, present when the query named a date. */
  window: appointmentWindowSchema.nullable(),
});

export const appointmentDataSchema = z.object({ appointment: appointmentDetailSchema });

export const appointmentServicesDataSchema = z.object({
  services: z.array(appointmentServiceSummarySchema),
});

export const availabilityDataSchema = z.object({
  date: dateOnlySchema,
  timezone: z.string().min(1),
  /** Business hours intersected with the staff week; null when there is none. */
  window: appointmentWindowSchema.nullable(),
  slots: z.array(availabilitySlotSchema),
});

export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;
export type AppointmentActor = z.infer<typeof appointmentActorSchema>;
export type AppointmentServiceSummary = z.infer<typeof appointmentServiceSummarySchema>;
export type AppointmentStatusHistory = z.infer<typeof appointmentStatusHistorySchema>;
export type AppointmentSummary = z.infer<typeof appointmentSummarySchema>;
export type AppointmentDetail = z.infer<typeof appointmentDetailSchema>;
export type AppointmentWindow = z.infer<typeof appointmentWindowSchema>;
export type AvailabilitySlot = z.infer<typeof availabilitySlotSchema>;
export type CreateAppointmentRequest = z.infer<typeof createAppointmentRequestSchema>;
export type UpdateAppointmentRequest = z.infer<typeof updateAppointmentRequestSchema>;
export type ReplaceAppointmentServicesRequest = z.infer<
  typeof replaceAppointmentServicesRequestSchema
>;
export type ChangeAppointmentStatusRequest = z.infer<typeof changeAppointmentStatusRequestSchema>;
export type AppointmentQuery = z.infer<typeof appointmentQuerySchema>;
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

export const appointmentsResponseSchema = apiEnvelopeSchema(appointmentsDataSchema);
export const appointmentResponseSchema = apiEnvelopeSchema(appointmentDataSchema);
export const appointmentServicesResponseSchema = apiEnvelopeSchema(appointmentServicesDataSchema);
export const appointmentAvailabilityResponseSchema = apiEnvelopeSchema(availabilityDataSchema);
