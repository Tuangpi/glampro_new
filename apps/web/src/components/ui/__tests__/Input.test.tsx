import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import Input from "../Input";

describe("Input", () => {
  it("labels the control so it can be found by name", () => {
    render(<Input label="Full name" />);

    expect(screen.getByLabelText("Full name")).toBeInTheDocument();
  });

  it("accepts typed text from the keyboard", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Input label="Full name" onChange={onChange} />);

    const input = screen.getByLabelText("Full name");
    await user.click(input);
    await user.keyboard("Ada Lovelace");

    expect(onChange).toHaveBeenCalled();
    expect(input).toHaveValue("Ada Lovelace");
  });

  it("cannot be typed into when disabled", async () => {
    const user = userEvent.setup();
    render(<Input label="Full name" disabled />);

    const input = screen.getByLabelText("Full name");
    expect(input).toBeDisabled();

    await user.type(input, "Ada");
    expect(input).toHaveValue("");
  });

  it("shows a hint and wires it to the control", () => {
    render(<Input label="Full name" hint="As it appears on the receipt" />);

    const input = screen.getByLabelText("Full name");
    expect(input).toHaveAccessibleDescription("As it appears on the receipt");
  });

  it("marks the field invalid and announces the error when validation fails", () => {
    render(<Input label="Email" error="Enter a valid email address" />);

    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Enter a valid email address");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email address");
  });

  it("drops the hint once an error is present, so only one message is read", () => {
    render(<Input label="Email" hint="Work address" error="Enter a valid email address" />);

    const input = screen.getByLabelText("Email");
    expect(input).toHaveAccessibleDescription("Enter a valid email address");
    expect(screen.queryByText("Work address")).not.toBeInTheDocument();
  });
});
