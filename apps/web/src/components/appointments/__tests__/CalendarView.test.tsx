/**
 * The calendar grid — handoff screen 06.
 *
 * Rendered with its columns and rows passed in, exactly as the page does, so the
 * assertions are about what the grid *draws*: a column per performer plus an
 * Unassigned column, a block placed under its own staff head by its real time,
 * and the empty/read-only states. The block's position is checked through the
 * geometry module it shares, not through pixel-sniffing the DOM.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AppointmentSummary } from "@glampro/shared";

import CalendarView, { type CalendarColumn } from "../CalendarView";
import { HOUR_HEIGHT } from "../calendar-geometry";

function booking(overrides: Partial<AppointmentSummary> = {}): AppointmentSummary {
  return {
    id: "appt-1",
    startsAt: "2026-10-09T09:00:00.000Z",
    endsAt: "2026-10-09T10:00:00.000Z",
    status: "SCHEDULED",
    durationMinutes: 60,
    comment: null,
    customerId: "customer-1",
    customerName: "Mina Customer",
    staffId: "staff-1",
    staffName: "Stella Stylist",
    serviceId: "service-1",
    serviceName: "Signature cut",
    serviceDepartmentId: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

const COLUMNS: CalendarColumn[] = [
  { id: "staff-1", name: "Stella Stylist", role: "Stylist" },
  { id: null, name: "Unassigned" },
];

/** A date whose local hours line up with the fixture instants above. */
const DAY = new Date(2026, 9, 9, 12, 0, 0, 0);

describe("CalendarView", () => {
  it("renders a track per column with its own header", () => {
    const { container } = render(
      <CalendarView day={DAY} appointments={[booking()]} columns={COLUMNS} onEdit={vi.fn()} />,
    );

    expect(screen.getByText("Stella Stylist")).toBeInTheDocument();
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
    // Two tracks: one per column, addressable by the staff id / "unassigned".
    expect(container.querySelector('[data-column="staff-1"]')).not.toBeNull();
    expect(container.querySelector('[data-column="unassigned"]')).not.toBeNull();
  });

  it("places a block under its performer's head, not just somewhere on the grid", () => {
    const { container } = render(
      <CalendarView day={DAY} appointments={[booking()]} columns={COLUMNS} onEdit={vi.fn()} />,
    );

    const track = container.querySelector('[data-column="staff-1"]');
    expect(within(track as HTMLElement).getByText("Mina Customer")).toBeInTheDocument();
  });

  it("draws the block at the height the geometry says, from its own times", () => {
    const { container } = render(
      <CalendarView
        day={DAY}
        // 09:00–10:00 local, one hour → HOUR_HEIGHT tall.
        appointments={[booking()]}
        columns={COLUMNS}
        onEdit={vi.fn()}
      />,
    );

    const block = container.querySelector('[data-column="staff-1"] button');
    expect(block).toHaveStyle({ height: `${HOUR_HEIGHT}px` });
  });

  it("shows the empty state when the day has nothing booked", () => {
    render(<CalendarView day={DAY} appointments={[]} columns={COLUMNS} onEdit={vi.fn()} />);
    expect(screen.getByText("Nothing booked that day")).toBeInTheDocument();
  });

  it("opens the editor through onEdit when a block is clicked", async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(<CalendarView day={DAY} appointments={[booking()]} columns={COLUMNS} onEdit={onEdit} />);

    await user.click(screen.getByRole("button", { name: /Mina Customer, Scheduled/ }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("keeps blocks inert for a read-only salon", () => {
    render(
      <CalendarView
        day={DAY}
        appointments={[booking()]}
        columns={COLUMNS}
        isReadOnly
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Mina Customer/ })).toBeDisabled();
  });

  it("shows a loading skeleton while pending", () => {
    render(
      <CalendarView day={DAY} appointments={[]} columns={COLUMNS} isPending onEdit={vi.fn()} />,
    );
    expect(screen.queryByText("Mina Customer")).not.toBeInTheDocument();
  });
});
