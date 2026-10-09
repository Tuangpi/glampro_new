import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useAppointmentList, useUpdateAppointment, mutateAsync, get } = vi.hoisted(() => ({
  useAppointmentList: vi.fn(),
  useUpdateAppointment: vi.fn(),
  mutateAsync: vi.fn(),
  get: vi.fn(),
}));
const readOnly = vi.hoisted(() => ({ value: false }));

vi.mock("@/hooks/useAppointments", () => ({ useAppointmentList, useUpdateAppointment }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ isReadOnly: readOnly.value }) }));
vi.mock("@/lib/api", () => ({
  get,
  getErrorMessage: vi.fn(() => "Could not update appointment."),
}));
vi.mock("@/components/appointments/AppointmentFormDrawer", () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">Appointment form</div> : null,
}));

const { default: Appointments } = await import("@/pages/Appointments");

const ROW = {
  id: "appointment-1",
  startsAt: "2026-10-09T09:00:00.000Z",
  endsAt: "2026-10-09T10:00:00.000Z",
  durationMinutes: 60,
  status: "SCHEDULED",
  customerId: "customer-1",
  customerName: "Mina Customer",
  staffId: "staff-1",
  staffName: "Stella Stylist",
  serviceId: "service-1",
  serviceName: "Signature cut",
  comment: null,
  finishedAt: null,
};

beforeEach(() => {
  readOnly.value = false;
  mutateAsync.mockReset().mockResolvedValue({});
  get.mockReset().mockResolvedValue(ROW);
  useAppointmentList.mockReturnValue({
    data: { data: [ROW], total: 1, page: 1, pageSize: 20, pageCount: 1 },
    isPending: false,
    isError: false,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  });
  useUpdateAppointment.mockReturnValue({ mutateAsync, isPending: false });
});

describe("Appointments", () => {
  it("queries the browser day and renders the real booking", () => {
    render(<Appointments />);

    const filters = useAppointmentList.mock.calls[0]?.[0] as { from: string; to: string };
    const from = new Date(filters.from);
    const to = new Date(filters.to);
    expect(from.getHours()).toBe(0);
    expect(to.getHours()).toBe(23);
    expect(to.getMinutes()).toBe(59);
    expect(screen.getByText("Mina Customer")).toBeInTheDocument();
    expect(screen.getByText("Signature cut")).toBeInTheDocument();
    expect(screen.getByText("Stella Stylist")).toBeInTheDocument();
  });

  it("completes a booking through the update contract", async () => {
    const user = userEvent.setup();
    render(<Appointments />);
    await user.click(screen.getByRole("button", { name: "Complete" }));
    expect(mutateAsync).toHaveBeenCalledWith({
      id: "appointment-1",
      input: { status: "COMPLETED" },
    });
  });

  it("opens the create drawer and disables writes for a suspended salon", async () => {
    readOnly.value = true;
    const user = userEvent.setup();
    render(<Appointments />);

    expect(screen.getByRole("button", { name: "Book appointment" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Complete" })).toBeDisabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    readOnly.value = false;
    render(<Appointments />);
    const enabled = screen.getAllByRole("button", { name: "Book appointment" }).at(-1);
    if (!enabled) throw new Error("Expected an enabled booking button.");
    await user.click(enabled);
    expect(screen.getByRole("dialog")).toHaveTextContent("Appointment form");
  });
});
