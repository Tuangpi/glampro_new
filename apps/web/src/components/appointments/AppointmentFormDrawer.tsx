/**
 * Book or edit an appointment — the form half of handoff screens 03/06.
 *
 * Three inputs are decided **here** rather than by the person filling the form
 * (`docs/mvp.md` → M2):
 *
 * 1. *Duration* comes from the service — the form shows the end time the server
 *    will compute (`startsAt + Service.durationMinutes`) but posts neither it
 *    nor the duration, so a two-hour block cannot be put on a one-hour service.
 * 2. *Who may perform it* is filtered to the service's department
 *    (`User.departments` ∩ `Service.departmentId`), the booking twin of M1's
 *    till picker — and the API refuses the rest anyway (ADR 0013).
 * 3. *The end time* on screen is a **preview**: the receipt of truth is the
 *    `endsAt` the create/update response returns.
 *
 * The three lists (services, customers, staff) are read once per open with a
 * large page rather than searched: a day-desk form picks from the salon's
 * whole book, and a second search box per select would be three requests a
 * screen the handoff drew as dropdowns does not need.
 */
import { useMemo, useState } from "react";

import type { AppointmentDetail, StaffSummary } from "@glampro/shared";

import Button from "@/components/ui/Button";
import Drawer from "@/components/ui/Drawer";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { showToast } from "@/components/ui/toast-store";
import { useCustomerList } from "@/hooks/useCustomers";
import { useCreateAppointment, useUpdateAppointment } from "@/hooks/useAppointments";
import { useServiceList } from "@/hooks/useServices";
import { useStaffList } from "@/hooks/useStaff";
import { getErrorMessage, getValidationDetails } from "@/lib/api";

const LIST_PAGE_SIZE = 200;

interface FormState {
  serviceId: string;
  customerId: string;
  staffId: string;
  /** `datetime-local` value: `YYYY-MM-DDTHH:mm` in the browser's timezone. */
  startsAt: string;
  comment: string;
}

/** The empty booking: no customer, no performer, the moment the form opened. */
function emptyForm(defaultStartsAt: string): FormState {
  return { serviceId: "", customerId: "", staffId: "", startsAt: defaultStartsAt, comment: "" };
}

/** ISO instant → the local value `<input type="datetime-local">` reads and writes. */
function toLocalInputValue(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export interface AppointmentFormDrawerProps {
  open: boolean;
  /** `null` creates; a booking edits. */
  appointment: AppointmentDetail | null;
  /** Where a *new* booking starts — the day the list is showing, or now. */
  defaultStartsAt: string;
  onClose: () => void;
}

export default function AppointmentFormDrawer({
  open,
  appointment,
  defaultStartsAt,
  onClose,
}: AppointmentFormDrawerProps) {
  // Seeded once at mount; the page keys this component on record + open state,
  // so a cancelled edit cannot leak into the next one without an effect that
  // would render the form twice on every open.
  const [form, setForm] = useState<FormState>(() =>
    appointment
      ? {
          serviceId: appointment.serviceId ?? "",
          customerId: appointment.customerId ?? "",
          staffId: appointment.staffId ?? "",
          startsAt: toLocalInputValue(appointment.startsAt),
          comment: appointment.comment ?? "",
        }
      : emptyForm(toLocalInputValue(defaultStartsAt)),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const services = useServiceList({ page: 1, pageSize: LIST_PAGE_SIZE, status: "ACTIVE" });
  const customers = useCustomerList({ page: 1, pageSize: LIST_PAGE_SIZE });
  const staff = useStaffList({ page: 1, pageSize: LIST_PAGE_SIZE, status: "active" });
  const createAppointment = useCreateAppointment();
  const updateAppointment = useUpdateAppointment();
  const isSaving = createAppointment.isPending || updateAppointment.isPending;
  const isEditing = appointment !== null;

  const serviceRows = useMemo(() => services.data?.data ?? [], [services.data]);
  const customerRows = useMemo(() => customers.data?.data ?? [], [customers.data]);
  const staffRows = useMemo(() => staff.data?.data ?? [], [staff.data]);

  const selectedService = serviceRows.find((service) => service.id === form.serviceId);

  /**
   * The booking's eligible performers: everyone when the salon has not tied the
   * service to a branch, otherwise the staff whose branches include it. This is
   * a convenience over ADR 0013 — the API refuses the rest regardless.
   */
  const eligibleStaff = useMemo(() => {
    if (!selectedService || selectedService.departmentId === null) return staffRows;
    return staffRows.filter((person: StaffSummary) =>
      person.departments.some((link) => link.id === selectedService.departmentId),
    );
  }, [staffRows, selectedService]);

  /** The end time the server will compute — shown, never posted. */
  const previewEndsAt = useMemo(() => {
    if (!selectedService || form.startsAt === "") return null;
    const start = new Date(form.startsAt);
    if (Number.isNaN(start.getTime())) return null;
    const minutes = selectedService.durationMinutes ?? 60;
    const end = new Date(start.getTime() + minutes * 60_000);
    return { time: end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), minutes };
  }, [selectedService, form.startsAt]);

  function setField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((previous) => {
      const next = { ...previous, [field]: value };
      // Switching to a service whose branch the chosen performer does not work
      // in must not leave a selection the API will refuse — clearing it here is
      // the same rule the server enforces, applied where the user can see it.
      if (field === "serviceId" && next.staffId !== "") {
        const service = serviceRows.find((entry) => entry.id === value);
        const person = staffRows.find((entry) => entry.id === next.staffId);
        const stillEligible =
          service?.departmentId === null ||
          service?.departmentId === undefined ||
          person?.departments.some((link) => link.id === service.departmentId);
        if (!stillEligible) next.staffId = "";
      }
      return next;
    });
  }

  /** The API prefixes paths with the request part; a form only knows field names. */
  const fieldError = (field: string): string | undefined =>
    fieldErrors[field] ?? fieldErrors[`body.${field}`];

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);

    const localErrors: Record<string, string> = {};
    if (form.serviceId === "") localErrors["serviceId"] = "Service is required";
    const start = new Date(form.startsAt);
    if (form.startsAt === "" || Number.isNaN(start.getTime())) {
      localErrors["startsAt"] = "Start time is required";
    }
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      return;
    }

    const startsAt = start.toISOString();
    const staffId = form.staffId === "" ? undefined : form.staffId;
    const customerId = form.customerId === "" ? undefined : form.customerId;
    const comment = form.comment.trim() === "" ? undefined : form.comment.trim();

    try {
      if (appointment) {
        await updateAppointment.mutateAsync({
          id: appointment.id,
          input: {
            serviceId: form.serviceId,
            startsAt,
            // Sent even when empty: on update the booking *replaces* the link,
            // so an empty value is how a performer or customer is cleared.
            staffId: form.staffId === "" ? null : form.staffId,
            customerId: form.customerId === "" ? null : form.customerId,
            comment: comment ?? null,
          },
        });
        showToast("success", "Appointment updated.");
      } else {
        await createAppointment.mutateAsync({
          serviceId: form.serviceId,
          startsAt,
          ...(staffId ? { staffId } : {}),
          ...(customerId ? { customerId } : {}),
          ...(comment ? { comment } : {}),
        });
        showToast("success", "Appointment booked.");
      }

      onClose();
    } catch (error) {
      const details = getValidationDetails(error);
      if (Object.keys(details).length > 0) {
        setFieldErrors(details);
        return;
      }
      setFormError(getErrorMessage(error));
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEditing ? "Edit appointment" : "Book appointment"}
      description={
        isEditing
          ? "Change the service, time or performer. The end time follows the service."
          : "Pick the service first — its length and the staff who may perform it come from it."
      }
      widthClassName="max-w-xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" form="appointment-form" loading={isSaving}>
            {isEditing ? "Save changes" : "Book appointment"}
          </Button>
        </>
      }
    >
      <form
        id="appointment-form"
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-4"
      >
        {formError ? (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            {formError}
          </p>
        ) : null}

        <Select
          label="Service"
          required
          value={form.serviceId}
          onChange={(event) => setField("serviceId", event.target.value)}
          error={fieldError("serviceId")}
          hint={
            previewEndsAt
              ? `${previewEndsAt.minutes} minutes — ends around ${previewEndsAt.time}.`
              : "The service decides how long the booking runs."
          }
          options={serviceRows.map((service) => ({
            value: service.id,
            label: service.durationMinutes
              ? `${service.name} (${service.durationMinutes} min)`
              : service.name,
          }))}
          disabled={services.isPending}
        />

        <Input
          label="Starts at"
          type="datetime-local"
          required
          value={form.startsAt}
          onChange={(event) => setField("startsAt", event.target.value)}
          error={fieldError("startsAt")}
        />

        <Select
          label="Customer"
          value={form.customerId}
          onChange={(event) => setField("customerId", event.target.value)}
          error={fieldError("customerId")}
          hint="Leave as Walk-in if the salon has no record of them yet."
          options={customerRows.map((customer) => ({
            value: customer.id,
            label: customer.memberId ? `${customer.name} (member)` : customer.name,
          }))}
          disabled={customers.isPending}
        />

        <Select
          label="Performer"
          value={form.staffId}
          onChange={(event) => setField("staffId", event.target.value)}
          error={fieldError("staffId")}
          hint={
            selectedService?.departmentId
              ? "Only staff in the service's department are offered."
              : "Who performs the service. Leave as Unassigned if nobody has claimed it yet."
          }
          options={eligibleStaff.map((person) => ({ value: person.id, label: person.name }))}
          disabled={staff.isPending}
        />

        <Input
          label="Comment"
          value={form.comment}
          onChange={(event) => setField("comment", event.target.value)}
          error={fieldError("comment")}
          hint="Anything the desk should know — preferences, patch tests, the usual."
          maxLength={2000}
        />
      </form>
    </Drawer>
  );
}
