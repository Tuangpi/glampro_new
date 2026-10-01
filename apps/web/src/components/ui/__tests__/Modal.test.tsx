import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import Button from "../Button";
import Modal from "../Modal";

/** `Modal` is controlled, so a harness is what proves opening and focus work. */
function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Refund sale
      </button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          onClose();
        }}
        title="Refund this sale?"
        description="The whole sale is refunded, including card payments."
      >
        <Button>Confirm refund</Button>
      </Modal>
    </>
  );
}

async function openModal(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Refund sale" }));
  return screen.getByRole("dialog");
}

describe("Modal", () => {
  it("renders nothing while closed", () => {
    render(<Harness />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens as a modal dialog named by its title", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const dialog = await openModal(user);

    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Refund this sale?");
    expect(dialog).toHaveAccessibleDescription(
      "The whole sale is refunded, including card payments.",
    );
  });

  it("moves focus into the dialog so the title is announced first", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const dialog = await openModal(user);

    expect(dialog).toHaveFocus();
  });

  it("keeps Tab inside the dialog and wraps at both ends", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const dialog = await openModal(user);

    await user.keyboard("{Tab}");
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();

    await user.keyboard("{Tab}");
    expect(screen.getByRole("button", { name: "Confirm refund" })).toHaveFocus();

    // Past the last control, focus wraps to the first rather than escaping.
    await user.keyboard("{Tab}");
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();

    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(screen.getByRole("button", { name: "Confirm refund" })).toHaveFocus();

    expect(dialog).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} />);
    await openModal(user);

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes from the close button", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} />);
    await openModal(user);

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the backdrop is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} />);
    const dialog = await openModal(user);

    const backdrop = dialog.parentElement?.firstElementChild;
    await user.click(backdrop as HTMLElement);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("returns focus to whatever opened it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Refund sale" });
    await openModal(user);

    await user.keyboard("{Escape}");

    expect(trigger).toHaveFocus();
  });

  it("stops the page behind it from scrolling, and puts it back", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await openModal(user);
    expect(document.body.style.overflow).toBe("hidden");

    await user.keyboard("{Escape}");
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});
