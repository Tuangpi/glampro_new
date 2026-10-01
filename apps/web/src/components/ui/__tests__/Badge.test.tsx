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
});
