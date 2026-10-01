import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import Checkbox from "../Checkbox";

describe("Checkbox", () => {
  it("takes its name from the label, which wraps the control", () => {
    render(<Checkbox label="Send receipt by SMS" />);

    expect(screen.getByRole("checkbox", { name: "Send receipt by SMS" })).toBeInTheDocument();
  });

  it("toggles from the keyboard with Space", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Checkbox label="Send receipt by SMS" onChange={onChange} />);

    const checkbox = screen.getByRole("checkbox", { name: "Send receipt by SMS" });
    await user.tab();
    expect(checkbox).toHaveFocus();

    await user.keyboard(" ");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(checkbox).toBeChecked();

    await user.keyboard(" ");
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(checkbox).not.toBeChecked();
  });

  it("toggles when the label text is clicked", async () => {
    const user = userEvent.setup();
    render(<Checkbox label="Send receipt by SMS" />);

    const checkbox = screen.getByRole("checkbox", { name: "Send receipt by SMS" });
    await user.click(screen.getByText("Send receipt by SMS"));

    expect(checkbox).toBeChecked();
  });

  it("cannot be toggled when disabled", async () => {
    const user = userEvent.setup();
    render(<Checkbox label="Send receipt by SMS" disabled />);

    const checkbox = screen.getByRole("checkbox", { name: "Send receipt by SMS" });
    expect(checkbox).toBeDisabled();

    await user.click(screen.getByText("Send receipt by SMS"));
    await user.keyboard(" ");

    expect(checkbox).not.toBeChecked();
  });

  it("marks the control invalid and announces the error when validation fails", () => {
    render(<Checkbox label="I agree" error="You must accept the terms" />);

    const checkbox = screen.getByRole("checkbox", { name: "I agree" });
    expect(checkbox).toHaveAttribute("aria-invalid", "true");
    expect(checkbox).toHaveAccessibleDescription("You must accept the terms");
  });
});
