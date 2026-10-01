import { render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "../Toast";
import { showToast } from "../toast-store";

const AUTO_DISMISS_MS = 5000;

describe("Toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing until a toast is raised", () => {
    render(
      <ToastProvider>
        <p>App</p>
      </ToastProvider>,
    );

    expect(screen.getByText("App")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("announces a raised toast politely", () => {
    render(<ToastProvider>{null}</ToastProvider>);

    act(() => showToast("success", "Sale saved"));

    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("Sale saved")).toBeInTheDocument();
  });

  it("keeps several toasts stacked", () => {
    render(<ToastProvider>{null}</ToastProvider>);

    act(() => {
      showToast("success", "Sale saved");
      showToast("error", "Card declined");
    });

    expect(screen.getByText("Sale saved")).toBeInTheDocument();
    expect(screen.getByText("Card declined")).toBeInTheDocument();
  });

  it("dismisses on request", () => {
    render(<ToastProvider>{null}</ToastProvider>);
    act(() => showToast("info", "Cart restored"));

    act(() => {
      screen.getByRole("button", { name: "Dismiss notification" }).click();
    });

    expect(screen.queryByText("Cart restored")).not.toBeInTheDocument();
  });

  it("dismisses itself so a toast cannot pile up forever", () => {
    render(<ToastProvider>{null}</ToastProvider>);
    act(() => showToast("success", "Sale saved"));

    act(() => {
      vi.advanceTimersByTime(AUTO_DISMISS_MS);
    });

    expect(screen.queryByText("Sale saved")).not.toBeInTheDocument();
  });

  it("does not stop rendering the app it wraps", () => {
    render(
      <ToastProvider>
        <p>Cart</p>
      </ToastProvider>,
    );
    act(() => showToast("error", "Something went wrong"));

    expect(screen.getByText("Cart")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });
});
