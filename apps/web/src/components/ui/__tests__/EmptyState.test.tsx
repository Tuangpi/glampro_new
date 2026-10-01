import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Cart } from "@/components/icons";
import Button from "../Button";
import EmptyState from "../EmptyState";

describe("EmptyState", () => {
  it("names the state it is showing", () => {
    render(<EmptyState title="No customers yet" />);

    expect(screen.getByText("No customers yet")).toBeInTheDocument();
  });

  it("explains what would fill the space", () => {
    render(
      <EmptyState
        title="No customers yet"
        description="Add a customer to book them into an appointment."
      />,
    );

    expect(
      screen.getByText("Add a customer to book them into an appointment."),
    ).toBeInTheDocument();
  });

  it("keeps the action reachable by keyboard", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <EmptyState
        title="No customers yet"
        action={<Button onClick={onClick}>Add customer</Button>}
      />,
    );

    await user.tab();
    expect(screen.getByRole("button", { name: "Add customer" })).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("hides the decorative icon from assistive technology", () => {
    const { container } = render(<EmptyState title="Cart is empty" icon={<Cart />} />);

    expect(screen.getByText("Cart is empty")).toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
