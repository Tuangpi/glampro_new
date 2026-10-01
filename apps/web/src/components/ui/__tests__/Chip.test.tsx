import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Users } from "@/components/icons";
import Chip from "../Chip";

describe("Chip", () => {
  it("renders as a passive tag when it cannot be selected", () => {
    render(<Chip>Hair</Chip>);

    expect(screen.getByText("Hair")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("announces its selected state instead of relying on colour", () => {
    render(<Chip onSelect={() => {}}>Hair</Chip>);

    expect(screen.getByRole("button", { name: "Hair" })).toHaveAttribute("aria-pressed", "false");
  });

  it("reports pressed when selected", () => {
    render(
      <Chip onSelect={() => {}} selected>
        Hair
      </Chip>,
    );

    expect(screen.getByRole("button", { name: "Hair" })).toHaveAttribute("aria-pressed", "true");
  });

  it("toggles from the keyboard", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<Chip onSelect={onSelect}>Hair</Chip>);

    await user.tab();
    expect(screen.getByRole("button", { name: "Hair" })).toHaveFocus();

    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("cannot be toggled when disabled", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <Chip onSelect={onSelect} disabled>
        Hair
      </Chip>,
    );

    const chip = screen.getByRole("button", { name: "Hair" });
    expect(chip).toBeDisabled();

    await user.click(chip);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("hides the decorative icon from the accessible name", () => {
    render(
      <Chip onSelect={() => {}} icon={<Users />}>
        Stylists
      </Chip>,
    );

    expect(screen.getByRole("button", { name: "Stylists" })).toBeInTheDocument();
  });
});
