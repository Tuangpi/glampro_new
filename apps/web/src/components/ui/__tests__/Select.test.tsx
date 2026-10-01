import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import Select from "../Select";

const OPTIONS = [
  { value: "maria", label: "Maria Santos" },
  { value: "juan", label: "Juan Reyes" },
];

describe("Select", () => {
  it("labels the control so it can be found by name", () => {
    render(<Select label="Customer" options={OPTIONS} />);

    expect(screen.getByLabelText("Customer")).toBeInTheDocument();
  });

  it("offers the options it was given", () => {
    render(<Select label="Customer" options={OPTIONS} />);

    expect(screen.getByRole("option", { name: "Maria Santos" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Juan Reyes" })).toBeInTheDocument();
  });

  it("starts on the placeholder rather than silently on the first option", () => {
    render(<Select label="Customer" options={OPTIONS} />);

    const select = screen.getByLabelText("Customer");
    expect(select).toHaveValue("");
  });

  it("keeps the placeholder out of the open list", () => {
    render(<Select label="Customer" options={OPTIONS} />);

    const select = screen.getByLabelText("Customer");
    expect(select.querySelector('option[value=""]')).toHaveAttribute("hidden");

    // A hidden option leaves the accessibility tree, so it cannot be reached by
    // role either — it is not offered as a choice next to the real options.
    expect(screen.queryByRole("option", { name: "Select…" })).not.toBeInTheDocument();
  });

  it("changes selection from the keyboard", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Select label="Customer" options={OPTIONS} onChange={onChange} />);

    const select = screen.getByLabelText("Customer");
    await user.selectOptions(select, "juan");

    expect(onChange).toHaveBeenCalled();
    expect(select).toHaveValue("juan");
  });

  it("cannot be changed when disabled", async () => {
    const user = userEvent.setup();
    render(<Select label="Customer" options={OPTIONS} disabled />);

    const select = screen.getByLabelText("Customer");
    expect(select).toBeDisabled();

    await user.selectOptions(select, "juan");
    expect(select).toHaveValue("");
  });

  it("marks the field invalid and announces the error when validation fails", () => {
    render(<Select label="Customer" options={OPTIONS} error="Choose a customer" />);

    const select = screen.getByLabelText("Customer");
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(select).toHaveAccessibleDescription("Choose a customer");
  });
});
