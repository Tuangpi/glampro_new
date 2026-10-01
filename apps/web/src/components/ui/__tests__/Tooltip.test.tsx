import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import Tooltip from "../Tooltip";

function setup() {
  return render(
    <Tooltip content="Refunds the whole sale">
      <button type="button">Refund</button>
    </Tooltip>,
  );
}

describe("Tooltip", () => {
  it("stays closed until the trigger is hovered or focused", () => {
    setup();

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("opens on keyboard focus, which is the path a mouse cannot replace", async () => {
    const user = userEvent.setup();
    setup();

    await user.tab();

    expect(screen.getByRole("tooltip")).toHaveTextContent("Refunds the whole sale");
  });

  it("opens on hover", async () => {
    const user = userEvent.setup();
    setup();

    await user.hover(screen.getByRole("button", { name: "Refund" }));

    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("describes the trigger rather than renaming it", async () => {
    const user = userEvent.setup();
    setup();

    const trigger = screen.getByRole("button", { name: "Refund" });
    expect(trigger).not.toHaveAttribute("aria-describedby");

    await user.tab();

    expect(trigger).toHaveAccessibleName("Refund");
    expect(trigger).toHaveAccessibleDescription("Refunds the whole sale");
  });

  it("closes on blur", async () => {
    const user = userEvent.setup();
    setup();

    await user.tab();
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    await user.tab();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("closes on Escape without moving focus", async () => {
    const user = userEvent.setup();
    setup();

    await user.tab();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refund" })).toHaveFocus();
  });

  it("places the tooltip below when asked", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Refunds the whole sale" placement="bottom">
        <button type="button">Refund</button>
      </Tooltip>,
    );

    await user.tab();

    expect(screen.getByRole("tooltip")).toHaveClass("top-full");
  });
});
