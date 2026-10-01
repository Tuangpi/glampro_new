import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import Button from "../Button";
import Card from "../Card";

describe("Card", () => {
  it("renders its title as a heading so it lands in the page outline", () => {
    render(<Card title="Today's sales">Total</Card>);

    expect(screen.getByRole("heading", { name: "Today's sales" })).toBeInTheDocument();
  });

  it("renders the description, body and footer", () => {
    render(
      <Card title="Cart" description="3 items" footer="Subtotal — $120.00">
        <p>Haircut</p>
      </Card>,
    );

    expect(screen.getByText("3 items")).toBeInTheDocument();
    expect(screen.getByText("Haircut")).toBeInTheDocument();
    expect(screen.getByText("Subtotal — $120.00")).toBeInTheDocument();
  });

  it("omits the header entirely when there is nothing to put in it", () => {
    render(<Card>Just a panel</Card>);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByText("Just a panel")).toBeInTheDocument();
  });

  it("keeps the accessible name of an action it hosts", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Card
        title="Customers"
        actions={
          <Button size="sm" onClick={onClick}>
            Add customer
          </Button>
        }
      >
        <p>List</p>
      </Card>,
    );

    await user.click(screen.getByRole("button", { name: "Add customer" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
