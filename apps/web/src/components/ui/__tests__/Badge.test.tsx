import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Badge from "../Badge";

describe("Badge", () => {
  it("renders its label as text", () => {
    render(<Badge>Paid</Badge>);

    expect(screen.getByText("Paid")).toBeInTheDocument();
  });

  it("is presentational, not a control", () => {
    render(<Badge>Paid</Badge>);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("hides the status dot from assistive technology", () => {
    const { container } = render(<Badge dot>Overdue</Badge>);

    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(container.querySelector("[aria-hidden]")).not.toBeNull();
  });

  it("reads the label alone, with no extra punctuation from the dot", () => {
    render(<Badge dot>Overdue</Badge>);

    expect(screen.getByText("Overdue")).toHaveTextContent(/^Overdue$/);
  });

  // Pinned by class name — jsdom does no Tailwind layout, so this guards
  // against a silent revert rather than measuring a pixel. See ADR 0006.
  it("carries the handoff's 4px 9px pill padding and 800 weight", () => {
    render(<Badge>Gold</Badge>);

    expect(screen.getByText("Gold")).toHaveClass("px-2.25", "py-1", "text-xs", "font-heavy");
  });

  // Q23 was settled by adding --sp-amber-text/--sp-amber-bg to the handoff token
  // file. If either token is dropped, Tailwind emits no rule for these classes
  // and the badge falls back to the inherited colour — silently, in jsdom too.
  it("paints the warning variant in the handoff's amber pair", () => {
    render(<Badge variant="warning">Gold</Badge>);

    expect(screen.getByText("Gold")).toHaveClass("bg-warning-soft", "text-warning");
  });

  it("paints the warning dot in the matching amber", () => {
    const { container } = render(
      <Badge variant="warning" dot>
        Gold
      </Badge>,
    );

    expect(container.querySelector("[aria-hidden]")).toHaveClass("bg-warning");
  });

  it("keeps the warning tone distinct from the other four", () => {
    const classesFor = (variant: "neutral" | "success" | "danger" | "warning" | "purple") => {
      const { unmount } = render(<Badge variant={variant}>x</Badge>);
      const found = screen.getByText("x").className;
      unmount();
      return found;
    };

    const tones = new Set([
      classesFor("neutral"),
      classesFor("success"),
      classesFor("danger"),
      classesFor("warning"),
      classesFor("purple"),
    ]);

    expect(tones.size).toBe(5);
  });
});
