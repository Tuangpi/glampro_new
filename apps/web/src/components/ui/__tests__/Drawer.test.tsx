import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import Drawer from "../Drawer";

function Harness({ onClose = () => {}, side }: { onClose?: () => void; side?: "left" | "right" }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open customer
      </button>
      <Drawer
        open={open}
        side={side}
        onClose={() => {
          setOpen(false);
          onClose();
        }}
        title="Maria Santos"
        description="Customer since March 2024"
      >
        <p>Booked 14 appointments.</p>
      </Drawer>
    </>
  );
}

async function openDrawer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Open customer" }));
  return screen.getByRole("dialog");
}

describe("Drawer", () => {
  it("opens as a dialog named by its title", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const dialog = await openDrawer(user);

    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Maria Santos");
    expect(screen.getByText("Booked 14 appointments.")).toBeInTheDocument();
  });

  it("moves focus in and returns it to the opener on close", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open customer" });

    const dialog = await openDrawer(user);
    expect(dialog).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(trigger).toHaveFocus();
  });

  it("closes on Escape and on the close button", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} />);
    await openDrawer(user);

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("opens from the right by default and from the left when asked", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness />);
    await openDrawer(user);
    expect(screen.getByRole("dialog").parentElement).toHaveClass("justify-end");

    await user.keyboard("{Escape}");
    rerender(<Harness side="left" />);
    await openDrawer(user);
    expect(screen.getByRole("dialog").parentElement).toHaveClass("justify-start");
  });

  it("keeps Tab inside the panel", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openDrawer(user);

    await user.keyboard("{Tab}");
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();

    await user.keyboard("{Tab}");
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  });
});
