import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Skeleton from "../Skeleton";

describe("Skeleton", () => {
  it("is hidden from assistive technology", () => {
    const { container } = render(<Skeleton />);

    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("is not announced as content", () => {
    render(<Skeleton />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("carries the loading state on its container instead", () => {
    render(
      <div aria-busy="true" aria-label="Loading customers">
        <Skeleton />
        <Skeleton />
      </div>,
    );

    expect(screen.getByLabelText("Loading customers")).toHaveAttribute("aria-busy", "true");
  });

  it("lets the caller shape it through className", () => {
    const { container } = render(<Skeleton className="h-28 w-16 rounded-card" />);

    const skeleton = container.firstElementChild;
    expect(skeleton).toHaveClass("h-28", "w-16", "rounded-card");
    expect(skeleton).toHaveClass("h-4", "w-full");
  });
});
