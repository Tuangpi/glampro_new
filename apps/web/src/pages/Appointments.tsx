/**
 * Appointments — handoff screens 03 and 06: the day list.
 *
 * **MVP slice M2** (`docs/mvp.md`): list by date range, read, create, update
 * and complete. The calendar grid, drag-to-reschedule, availability and clash
 * detection, shifts and leave, and reminders are full-phase work and are
 * deliberately not stubbed here — an absent capability is absent, not faked.
 *
 * The window is the **browser's day** rendered as instants, the same edges the
 * dashboard's tiles count, so "3 appointments today" and the three rows below
 * are one fact asked twice. "Today" is local because the salon's day is local;
 * the schema has no timezone column to ask about (see `schemas/appointment.ts`).
 */
import { useState } from "react";

import type { AppointmentDetail, AppointmentSummary } from "@glampro/shared";

import AppointmentFormDrawer from "@/components/appointments/AppointmentFormDrawer";
import { Calendar, ChevronLeft, Plus, Search } from "@/components/icons";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Select from "@/components/ui/Select";
import Skeleton from "@/components/ui/Skeleton";
import Table, { type TableColumn } from "@/components/ui/Table";
import { showToast } from "@/components/ui/toast-store";
import {
  APPOINTMENT_STATUS_BADGE,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_OPTIONS,
  OPEN_APPOINTMENT_STATUSES,
} from "@/constants/appointments";
import { useAuth } from "@/contexts/AuthContext";
import { useAppointmentList, useUpdateAppointment } from "@/hooks/useAppointments";
import { get, getErrorMessage } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";

const PAGE_SIZE = 20;

/** Local midnight for the day offset — the window's own edges, not UTC's. */
function dayWindow(day: Date): { from: string; to: string } {
  const from = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const to = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Whether the list is showing the browser's own day. */
function isToday(day: Date): boolean {
  return day.toDateString() === new Date().toDateString();
}

function shiftDay(day: Date, days: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + days);
}

/**
 * Where a booking made from this view starts.
 *
 * The desk books *into the view it is looking at*, so a new appointment lands on
 * the next half hour when that view is today, and at 09:00 on a day that is not —
 * "now" on yesterday's list would be a trap. Derived rather than kept in state:
 * the value is only read by the drawer's initialiser, and it has to be right at
 * the moment the desk opens the form, not whenever the day last changed.
 */
function bookingStart(day: Date): string {
  if (!isToday(day)) {
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0).toISOString();
  }

  const now = new Date();
  const rounded = new Date(now);
  rounded.setMinutes(now.getMinutes() > 30 ? 60 : 30, 0, 0);
  return rounded.toISOString();
}

export default function Appointments() {
  const { isReadOnly } = useAuth();

  const [day, setDay] = useState(() => new Date());
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<AppointmentDetail | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Booking defaults come from `bookingStart(day)` at the moment the drawer opens
  // — see that function; there is no effect writing into state for it.

  const dayRange = dayWindow(day);
  const { data, isPending, isError, error, isFetching, refetch } = useAppointmentList({
    page: 1,
    pageSize: PAGE_SIZE,
    from: dayRange.from,
    to: dayRange.to,
    status: (status || undefined) as AppointmentSummary["status"] | undefined,
  });

  const update = useUpdateAppointment();
  const rows = data?.data ?? [];
  const showingToday = isToday(day);

  function openCreate() {
    setEditing(null);
    setDrawerOpen(true);
  }

  async function openEdit(appointment: AppointmentSummary) {
    // A list row is a summary and the form needs the whole record (finishedAt),
    // so opening the editor is a second read rather than a re-use of the row —
    // the same rule the customer screen keeps.
    setEditing(await get<AppointmentDetail>(`/appointments/${appointment.id}`));
    setDrawerOpen(true);
  }

  async function quickStatus(appointment: AppointmentSummary, next: "COMPLETED" | "CANCELLED") {
    try {
      await update.mutateAsync({ id: appointment.id, input: { status: next } });
      showToast(
        "success",
        next === "COMPLETED" ? "Appointment completed." : "Appointment cancelled.",
      );
    } catch (error_) {
      showToast("error", getErrorMessage(error_));
    }
  }

  const columns: TableColumn<AppointmentSummary>[] = [
    {
      key: "time",
      header: "Time",
      cell: (row) => (
        <div>
          <p className="font-bold text-ink">
            {new Date(row.startsAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <p className="text-xs text-ink-muted">
            {row.durationMinutes ? `${row.durationMinutes} min` : "—"}
          </p>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      cell: (row) =>
        row.customerName ? (
          <span className="font-bold text-ink">{row.customerName}</span>
        ) : (
          <span className="text-ink-muted">Walk-in</span>
        ),
    },
    { key: "service", header: "Service", cell: (row) => row.serviceName ?? "—" },
    { key: "staff", header: "Performer", cell: (row) => row.staffName ?? "Unassigned" },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <Badge variant={APPOINTMENT_STATUS_BADGE[row.status]}>
          {APPOINTMENT_STATUS_LABELS[row.status]}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <div className="flex justify-end gap-1.5">
          {OPEN_APPOINTMENT_STATUSES.includes(row.status) ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={isReadOnly || update.isPending}
                onClick={() => void quickStatus(row, "COMPLETED")}
              >
                Complete
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={isReadOnly || update.isPending}
                onClick={() => void quickStatus(row, "CANCELLED")}
              >
                Cancel
              </Button>
            </>
          ) : null}
          <Button variant="secondary" size="sm" onClick={() => void openEdit(row)}>
            Edit
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl">Appointments</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {formatDate(day.toISOString(), {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-line bg-surface">
            <button
              type="button"
              aria-label="Previous day"
              onClick={() => setDay((current) => shiftDay(current, -1))}
              className="flex h-control w-control items-center justify-center text-ink-body transition hover:bg-surface-muted"
            >
              <ChevronLeft aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setDay(new Date())}
              className={cn(
                "h-control px-3 text-sm font-medium transition",
                showingToday ? "text-purple" : "text-ink-body hover:bg-surface-muted",
              )}
            >
              Today
            </button>
            <button
              type="button"
              aria-label="Next day"
              onClick={() => setDay((current) => shiftDay(current, 1))}
              className="flex h-control w-control items-center justify-center text-ink-body transition hover:bg-surface-muted"
            >
              <ChevronLeft aria-hidden className="rotate-180" />
            </button>
          </div>

          <Select
            label="Status"
            hideLabel
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            options={APPOINTMENT_STATUS_OPTIONS}
            className="w-44"
          />

          <Button onClick={openCreate} disabled={isReadOnly}>
            <Plus aria-hidden />
            Book appointment
          </Button>
        </div>
      </header>

      <section
        aria-busy={isPending || isFetching}
        aria-label="Appointments for the selected day"
        className="rounded-card border border-line bg-surface"
      >
        <div className="flex items-center justify-between border-b border-line-soft px-5 py-3.5">
          <p className="text-sm text-ink-muted">
            {isPending
              ? "Loading appointments…"
              : `${data?.total ?? 0} ${data?.total === 1 ? "appointment" : "appointments"}`}
            {status
              ? ` · ${APPOINTMENT_STATUS_OPTIONS.find((option) => option.value === status)?.label}`
              : ""}
          </p>
        </div>

        {isPending ? (
          <div className="flex flex-col gap-3 p-5">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-11" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            title="The book could not be loaded"
            description={getErrorMessage(error)}
            icon={<Calendar />}
            action={<Button onClick={() => void refetch()}>Try again</Button>}
          />
        ) : (
          <Table
            caption="Appointments for the selected day"
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            className="rounded-none border-0"
            empty={
              status || !showingToday ? (
                <EmptyState
                  title="Nothing booked for that view"
                  description={
                    status
                      ? "No appointments match this status on the selected day."
                      : "The book is empty for this day. Move the date or book the first one."
                  }
                  icon={<Search />}
                  action={
                    <Button variant="secondary" onClick={() => setStatus("")}>
                      Clear filter
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  title="No appointments today"
                  description="Book the first appointment of the day and it will show up here."
                  icon={<Calendar />}
                  action={
                    <Button onClick={openCreate} disabled={isReadOnly}>
                      Book appointment
                    </Button>
                  }
                />
              )
            }
          />
        )}
      </section>

      <AppointmentFormDrawer
        // Remounting on open and on record change is what clears the form.
        key={`${editing?.id ?? "new"}:${drawerOpen}`}
        open={drawerOpen}
        appointment={editing}
        defaultStartsAt={bookingStart(day)}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
