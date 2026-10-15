import { MemoryRouter } from "react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useModules,
  useSalonProfile,
  useUpdateSalonProfile,
  useStaffList,
  mutateAsync,
  getValidationDetails,
} = vi.hoisted(() => ({
  useModules: vi.fn(),
  useSalonProfile: vi.fn(),
  useUpdateSalonProfile: vi.fn(),
  useStaffList: vi.fn(),
  mutateAsync: vi.fn(),
  getValidationDetails: vi.fn(() => ({})),
}));
const auth = vi.hoisted(() => ({ role: "SUPER_ADMIN", readOnly: false }));

vi.mock("@/hooks/useSettings", () => ({ useModules, useSalonProfile, useUpdateSalonProfile }));
vi.mock("@/hooks/useStaff", () => ({ useStaffList }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isReadOnly: auth.readOnly,
    user: { globalRole: auth.role },
  }),
}));
vi.mock("@/lib/api", () => ({
  getErrorMessage: vi.fn(() => "Save failed."),
  getValidationDetails,
}));

const { default: Settings } = await import("@/pages/Settings");

beforeEach(() => {
  auth.role = "SUPER_ADMIN";
  auth.readOnly = false;
  mutateAsync.mockReset().mockResolvedValue({});
  getValidationDetails.mockReturnValue({});
  useSalonProfile.mockReturnValue({
    data: {
      id: "tenant-1",
      name: "Ava Salon",
      slug: "ava-salon",
      status: "ACTIVE",
      lowStockThreshold: 5,
      owner: { id: "owner-1", name: "Ava Owner", email: "ava@example.com" },
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-10-09T00:00:00.000Z",
    },
    isPending: false,
    isError: false,
  });
  useModules.mockReturnValue({
    data: [
      {
        code: "dashboard",
        name: "Dashboard",
        category: "Core",
        isCore: true,
        entitled: true,
        expiresAt: null,
      },
      {
        code: "reports",
        name: "Reports",
        category: "Add-on",
        isCore: false,
        entitled: true,
        expiresAt: null,
      },
    ],
    isPending: false,
    isError: false,
  });
  useStaffList.mockReturnValue({
    data: {
      data: [
        {
          id: "staff-1",
          name: "Stella Stylist",
          email: "stella@example.com",
          globalRole: "STAFF",
          position: "Senior stylist",
          phone: null,
          avatar: null,
          disabled: false,
          departmentIds: [],
          departmentNames: [],
          createdAt: "2026-01-02T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
      pageCount: 1,
    },
    isPending: false,
    isError: false,
  });
  useUpdateSalonProfile.mockReturnValue({ mutateAsync, isPending: false });
});

function renderSettings() {
  return render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>,
  );
}

describe("Settings", () => {
  it("uses salon-facing guidance without architecture or release-planning copy", () => {
    renderSettings();

    expect(screen.getByText("Salon identifier")).toBeInTheDocument();
    expect(
      screen.getByText("Products with stock at or below this quantity are marked as low stock."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "View the features available to your salon. Contact support to change your subscription.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/ADR 0010|when those features ship|entitlements|platform operator/i),
    ).not.toBeInTheDocument();
  });

  it("renders the profile, purchased modules and the real team summary", () => {
    renderSettings();
    expect(screen.getByDisplayValue("Ava Salon")).toBeInTheDocument();
    expect(screen.getByText("ava-salon")).toBeInTheDocument();
    expect(screen.getByText("Reports")).toBeInTheDocument();
    expect(screen.getByText("Stella Stylist")).toBeInTheDocument();
    expect(screen.getByText("Senior stylist")).toBeInTheDocument();
  });

  it("saves only the two salon-editable fields", async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.clear(screen.getByLabelText("Salon name"));
    await user.type(screen.getByLabelText("Salon name"), "New Salon Name");
    await user.clear(screen.getByLabelText("Low-stock threshold"));
    await user.type(screen.getByLabelText("Low-stock threshold"), "8");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(mutateAsync).toHaveBeenCalledWith({ name: "New Salon Name", lowStockThreshold: 8 });
  });

  it("removes the save action for a staff member", () => {
    auth.role = "STAFF";
    renderSettings();
    expect(screen.queryByRole("button", { name: "Save profile" })).not.toBeInTheDocument();
    expect(
      screen.getByText("Only a manager or the owner can change the salon profile."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Salon name")).toBeDisabled();
  });
});
