import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useDashboardSummary, useSystemStatus, refetch } = vi.hoisted(() => ({
  useDashboardSummary: vi.fn(),
  useSystemStatus: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock("@/hooks/useDashboard", () => ({ useDashboardSummary }));
vi.mock("@/hooks/useSystemStatus", () => ({ useSystemStatus }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { name: "Ava Owner" } }),
}));

const { default: Dashboard } = await import("@/pages/Dashboard");

beforeEach(() => {
  refetch.mockReset();
  useDashboardSummary.mockReturnValue({
    data: {
      incomeToday: "125.50",
      salesToday: 3,
      appointmentsToday: 4,
      newCustomersToday: 2,
      lowStock: 5,
      asOf: "2026-10-09T10:00:00.000Z",
    },
    isError: false,
  });
  useSystemStatus.mockReturnValue({
    data: {
      status: "ok",
      app: "Glampro API",
      environment: "test",
      uptimeSeconds: 125,
      database: "up",
    },
    isPending: false,
    isError: false,
    isFetching: false,
    refetch,
  });
});

describe("Dashboard", () => {
  it("renders one server summary and the live system status", () => {
    render(<Dashboard />);

    expect(screen.getByText("Welcome, Ava to Glampro Salon")).toBeInTheDocument();
    expect(screen.getByText("$125.50")).toBeInTheDocument();
    expect(screen.getByText("Today’s income · 3 sales")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("All systems operational")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("2m 5s")).toBeInTheDocument();
  });

  it("re-checks readiness on demand", async () => {
    const user = userEvent.setup();
    render(<Dashboard />);
    await user.click(screen.getByRole("button", { name: "Re-check status" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("shows dashes and an explanation when the summary fails", () => {
    useDashboardSummary.mockReturnValue({ data: undefined, isError: true });
    render(<Dashboard />);
    expect(screen.getByText(/figures could not be loaded/i)).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(4);
  });
});
