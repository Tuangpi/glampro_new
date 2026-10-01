import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import Pagination from "../Pagination";

describe("Pagination", () => {
  it("names the navigation", () => {
    render(
      <Pagination page={2} pageCount={8} onPageChange={() => {}} label="Customer list pages" />,
    );

    expect(screen.getByRole("navigation", { name: "Customer list pages" })).toBeInTheDocument();
  });

  it("marks the current page for assistive technology", () => {
    render(
      <Pagination page={3} pageCount={8} onPageChange={() => {}} label="Customer list pages" />,
    );

    expect(screen.getByRole("button", { name: "3" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "2" })).not.toHaveAttribute("aria-current");
  });

  it("shows the first, last and the pages around the current one", () => {
    render(
      <Pagination page={5} pageCount={9} onPageChange={() => {}} label="Customer list pages" />,
    );

    expect(screen.getByRole("button", { name: "1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "9" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "6" })).toBeInTheDocument();
  });

  it("disables Previous on the first page", () => {
    render(
      <Pagination page={1} pageCount={8} onPageChange={() => {}} label="Customer list pages" />,
    );

    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();
  });

  it("disables Next on the last page", () => {
    render(
      <Pagination page={8} pageCount={8} onPageChange={() => {}} label="Customer list pages" />,
    );

    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeEnabled();
  });

  it("steps with the arrow buttons from the keyboard", async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Pagination page={3} pageCount={8} onPageChange={onPageChange} label="Customer list pages" />,
    );

    await user.tab();
    expect(screen.getByRole("button", { name: "Previous page" })).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("jumps to a page by number", async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Pagination page={1} pageCount={9} onPageChange={onPageChange} label="Customer list pages" />,
    );

    await user.click(screen.getByRole("button", { name: "9" }));

    expect(onPageChange).toHaveBeenCalledWith(9);
  });

  it("renders nothing when there is only one page", () => {
    const { container } = render(
      <Pagination page={1} pageCount={1} onPageChange={() => {}} label="Customer list pages" />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
