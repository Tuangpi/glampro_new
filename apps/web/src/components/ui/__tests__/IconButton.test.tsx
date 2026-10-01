import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Trash } from "@/components/icons";
import IconButton from "../IconButton";

describe("IconButton", () => {
  it("takes its accessible name from label, not from the icon", () => {
    render(<IconButton label="Delete customer" icon={<Trash />} />);

    expect(screen.getByRole("button", { name: "Delete customer" })).toBeInTheDocument();
  });

  it("hides the decorative icon from assistive technology", () => {
    const { container } = render(<IconButton label="Delete customer" icon={<Trash />} />);

    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("activates from the keyboard", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<IconButton label="Delete customer" icon={<Trash />} onClick={onClick} />);

    await user.tab();
    expect(screen.getByRole("button", { name: "Delete customer" })).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not activate when disabled", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<IconButton label="Delete customer" icon={<Trash />} disabled onClick={onClick} />);

    const button = screen.getByRole("button", { name: "Delete customer" });
    expect(button).toBeDisabled();

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("offers the label as a tooltip too", () => {
    render(<IconButton label="Delete customer" icon={<Trash />} />);

    expect(screen.getByRole("button", { name: "Delete customer" })).toHaveAttribute(
      "title",
      "Delete customer",
    );
  });
});
