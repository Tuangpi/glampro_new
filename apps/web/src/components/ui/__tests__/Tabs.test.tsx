import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import Tabs, { type TabItem } from "../Tabs";

const ITEMS: TabItem[] = [
  { id: "all", label: "All", content: <p>All appointments</p> },
  { id: "today", label: "Today", content: <p>Today only</p> },
  { id: "week", label: "This week", content: <p>This week</p> },
];

/** `Tabs` is controlled, so a wrapper is what proves selection actually moves. */
function ControlledTabs({
  items = ITEMS,
  initial = "all",
}: {
  items?: TabItem[];
  initial?: string;
}) {
  const [active, setActive] = useState(initial);
  return <Tabs label="Appointments" items={items} activeId={active} onChange={setActive} />;
}

describe("Tabs", () => {
  it("names the tab set", () => {
    render(<ControlledTabs />);

    expect(screen.getByRole("tablist", { name: "Appointments" })).toBeInTheDocument();
  });

  it("shows only the active tab as selected, and its panel", () => {
    render(<ControlledTabs initial="today" />);

    expect(screen.getByRole("tab", { name: "Today" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByText("Today only")).toBeInTheDocument();
    expect(screen.queryByText("All appointments")).not.toBeInTheDocument();
  });

  it("links each tab to its panel", () => {
    render(<ControlledTabs initial="week" />);

    const tab = screen.getByRole("tab", { name: "This week" });
    const panel = screen.getByRole("tabpanel");

    expect(tab).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", tab.id);
  });

  it("keeps only the active tab in the tab order", () => {
    render(<ControlledTabs initial="all" />);

    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Today" })).toHaveAttribute("tabindex", "-1");
  });

  it("moves between tabs with the arrow keys and wraps around", async () => {
    const user = userEvent.setup();
    render(<ControlledTabs initial="all" />);

    await user.tab();
    expect(screen.getByRole("tab", { name: "All" })).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Today" })).toHaveFocus();
    expect(screen.getByText("Today only")).toBeInTheDocument();

    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(screen.getByRole("tab", { name: "All" })).toHaveFocus();
  });

  it("jumps to the ends with Home and End", async () => {
    const user = userEvent.setup();
    render(<ControlledTabs initial="today" />);

    await user.tab();
    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "This week" })).toHaveFocus();

    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "All" })).toHaveFocus();
  });

  it("skips a disabled tab when cycling", async () => {
    const user = userEvent.setup();
    const items: TabItem[] = [
      { id: "all", label: "All", content: <p>All</p> },
      { id: "locked", label: "Locked", disabled: true, content: <p>Locked</p> },
      { id: "today", label: "Today", content: <p>Today</p> },
    ];
    render(<ControlledTabs items={items} initial="all" />);

    expect(screen.getByRole("tab", { name: "Locked" })).toBeDisabled();

    await user.tab();
    await user.keyboard("{ArrowRight}");

    expect(screen.getByRole("tab", { name: "Today" })).toHaveFocus();
  });

  it("selects a tab on click", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Tabs label="Appointments" items={ITEMS} activeId="all" onChange={onChange} />);

    await user.click(screen.getByRole("tab", { name: "This week" }));

    expect(onChange).toHaveBeenCalledWith("week");
  });
});
