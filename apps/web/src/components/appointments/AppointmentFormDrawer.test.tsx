import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

const { create } = vi.hoisted(() => ({ create: vi.fn().mockResolvedValue({}) }));
vi.mock("@/hooks/useAppointments", () => ({
  useCreateAppointment: () => ({ mutateAsync: create, isPending: false }),
  useUpdateAppointment: () => ({ isPending: false }),
}));
vi.mock("@/hooks/useCustomers", () => ({
  useCustomerList: () => ({ data: { data: [] }, isPending: false }),
}));
vi.mock("@/hooks/useServices", () => ({
  useServiceList: () => ({
    data: { data: [{ id: "hair", name: "Cut", departmentId: "hair", durationMinutes: 30 }] },
    isPending: false,
  }),
}));
vi.mock("@/hooks/useStaff", () => ({
  useStaffList: () => {
    const sam = { id: "a", name: "Sam", email: "a@example.test", departments: [{ id: "hair" }] };
    return {
      data: {
        data: [
          sam,
          sam,
          { ...sam, id: "b", email: "b@example.test" },
          { ...sam, id: "nails", email: "nails@example.test", departments: [{ id: "nails" }] },
        ],
      },
      isPending: false,
    };
  },
}));

import AppointmentFormDrawer from "./AppointmentFormDrawer";

it("offers distinct eligible performer identities and submits the selected account ID", async () => {
  const user = userEvent.setup();
  render(
    <AppointmentFormDrawer
      open
      appointment={null}
      defaultStartsAt="2026-10-20T10:00:00Z"
      onClose={vi.fn()}
    />,
  );
  await user.selectOptions(screen.getByRole("combobox", { name: "Service" }), "hair");
  const picker = screen.getByRole("combobox", { name: "Performer" });
  expect(within(picker).getAllByRole("option", { name: "Sam (a@example.test)" })).toHaveLength(1);
  expect(within(picker).queryByRole("option", { name: /nails@example/ })).not.toBeInTheDocument();
  await user.selectOptions(picker, "b");
  await user.click(screen.getByRole("button", { name: "Book appointment" }));
  await waitFor(() =>
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ serviceId: "hair", staffId: "b" }),
    ),
  );
});
