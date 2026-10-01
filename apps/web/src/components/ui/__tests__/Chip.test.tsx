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

  // Pinned by class name — jsdom does no Tailwind layout, so these guard
  // against a silent revert rather than measuring a pixel. See ADR 0006.
  it("fills a selected chip solid purple with white text, as .toggle-chip.active does", () => {
    render(
      <Chip onSelect={() => {}} selected>
        Hair
      </Chip>,
    );

    expect(screen.getByRole("button", { name: "Hair" })).toHaveClass(
      "bg-purple",
      "text-white",
      "border-purple",
    );
  });

  it("keeps the muted icon tone, but turns it white on a selected fill", () => {
    const { rerender } = render(
      <Chip onSelect={() => {}} icon={<Users />}>
        Stylists
      </Chip>,
    );

    expect(screen.getByRole("button").querySelector("[aria-hidden]")).toHaveClass("text-ink-muted");

    rerender(
      <Chip onSelect={() => {}} selected icon={<Users />}>
        Stylists
      </Chip>,
    );

    expect(screen.getByRole("button").querySelector("[aria-hidden]")).toHaveClass("text-white");
  });

  it("gives the passive tag the handoff's 8px 14px padding and the toggle 44px", () => {
    const { rerender } = render(<Chip>Hair</Chip>);

    expect(screen.getByText("Hair")).toHaveClass("px-3.5", "py-2");

    rerender(<Chip onSelect={() => {}}>Hair</Chip>);

    expect(screen.getByRole("button", { name: "Hair" })).toHaveClass("px-3.5", "h-control");
  });
});
