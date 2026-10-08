/**
 * The till — handoff screens 01–02.
 *
 * What is worth pinning here is the behaviour the contracts make necessary:
 *
 * - **The category tabs are the server's `searchableKinds`**, not a list the
 *   browser keeps. An add-on the salon has not bought gets no tab, and a second
 *   tab does not fetch: one search answered every kind.
 * - **The cart re-prices a line from the customer** (`isMember`), because the
 *   search returns both prices for exactly that reason.
 * - **A granting line forces a customer** before payment, and the tender posts
 *   the whole cart with an idempotency key.
 * - **A suspended salon cannot ring anything up** — the shell says so and the
 *   API refuses, so the grid must not quietly fill a cart.
 *
 * `useSale` is mocked through `importActual`, so the cart reducers under test are
 * the real ones: `useSaleCart` is client state in the query cache and needs no
 * server. Only the two searches are replaced — `useCreateSale` stays real and its
 * network call (`post`) is the mock, so a successful write clears the cart exactly
 * as it does in the browser, and the idempotency key is the one that will ship.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SaleDetail, SaleItemKind } from "@glampro/shared";

const { useSaleItems, useSaleCustomers } = vi.hoisted(() => ({
  useSaleItems: vi.fn(),
  useSaleCustomers: vi.fn(),
}));

const { post, getErrorMessage } = vi.hoisted(() => ({
  post: vi.fn(),
  getErrorMessage: vi.fn<() => string>(() => "Something went wrong."),
}));

vi.mock("@/lib/api", () => ({
  get: vi.fn(),
  getPaginated: vi.fn(),
  post,
  patch: vi.fn(),
  getErrorMessage,
}));

vi.mock("@/hooks/useSale", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useSale")>("@/hooks/useSale");
  return { ...actual, useSaleItems, useSaleCustomers };
});

const { useServiceList, useStaffList } = vi.hoisted(() => ({
  useServiceList: vi.fn(),
  useStaffList: vi.fn(),
}));

vi.mock("@/hooks/useServices", () => ({ useServiceList }));
vi.mock("@/hooks/useStaff", () => ({ useStaffList }));

const isReadOnly = vi.hoisted(() => ({ value: false }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ isReadOnly: isReadOnly.value }) }));

const { default: Sale } = await import("@/pages/Sale");

const SERVICE = {
  kind: "SERVICE",
  id: "s1",
  name: "Root colour",
  price: "80.00",
  memberPrice: "70.00",
  points: 5,
  durationMinutes: 90,
};

const PRODUCT = {
  kind: "PRODUCT",
  id: "p1",
  name: "Shampoo",
  price: "12.50",
  memberPrice: null,
  points: 1,
  quantity: 7,
  lowStock: false,
};

const PACKAGE = {
  kind: "PACKAGE",
  id: "k1",
  name: "Five-cut bundle",
  price: "250.00",
  memberPrice: "225.00",
  sessionCount: 5,
  serviceCount: 2,
};

const CUSTOMER = {
  id: "c1",
  code: null,
  name: "Mrs Loi",
  memberId: "M-88",
  email: "mrsloi88@gmail.com",
  phone: "9030 9386",
  gender: null,
  dateOfBirth: null,
  address: null,
  comment: null,
  createdAt: "2021-03-04T00:00:00.000Z",
  updatedAt: "2021-03-04T00:00:00.000Z",
};

/** The search result the page destructures, with the flags defaulted. */
function itemsResult(searchableKinds: SaleItemKind[], items: unknown[]) {
  return {
    data: { searchableKinds, items },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  };
}

function listResult(rows: unknown[]) {
  return {
    data: { data: rows, total: rows.length, page: 1, pageSize: 200, pageCount: 1 },
    isPending: false,
    isError: false,
  };
}

/** A receipt shaped like `saleDetailSchema`, for the write's success path. */
function receipt(overrides: Partial<SaleDetail> = {}): SaleDetail {
  return {
    id: "sale-1",
    receiptNumber: 1042,
    status: "COMPLETED",
    paymentStatus: "PAID",
    soldAt: "2026-03-04T10:15:00.000Z",
    customerId: null,
    customerName: null,
    staffId: "u1",
    staffName: "Ava Owner",
    note: null,
    totalQuantity: 1,
    totalAmount: "80.00",
    paidAmount: "80.00",
    outstandingAmount: "0.00",
    pointsEarned: 5,
    lines: [
      {
        id: "l1",
        itemType: "SERVICE",
        itemId: "s1",
        itemName: "Root colour",
        quantity: 1,
        unitPrice: "80.00",
        lineTotal: "80.00",
        staffId: null,
        staffName: null,
      },
    ],
    payments: [{ method: "CASH", amount: "80.00", sessionId: null }],
    ...overrides,
  };
}

function renderSale() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <Sale />
    </QueryClientProvider>,
  );
}

/** The cart panel's own region, found by its heading so grid prices are excluded. */
function cartPanel(): HTMLElement {
  return screen.getByRole("heading", { name: "Cart" }).closest("section") as HTMLElement;
}

beforeEach(() => {
  isReadOnly.value = false;
  useSaleItems.mockReturnValue(itemsResult(["SERVICE", "PRODUCT"], [SERVICE, PRODUCT]));
  useSaleCustomers.mockReturnValue(listResult([CUSTOMER]));
  useServiceList.mockReturnValue(listResult([]));
  useStaffList.mockReturnValue(listResult([]));
  getErrorMessage.mockReturnValue("Something went wrong.");
  post.mockReset().mockResolvedValue(receipt());
});

describe("the category tabs", () => {
  it("draws one per kind the server named, and no other", () => {
    renderSale();

    expect(screen.getByRole("tab", { name: "Services" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Products" })).toBeInTheDocument();
    // The salon has not bought Packages, so `/sales/items` left the kind out.
    expect(screen.queryByRole("tab", { name: "Packages" })).not.toBeInTheDocument();
  });

  it("shows the active tab's rows only", async () => {
    const user = userEvent.setup();
    renderSale();

    expect(screen.getByText("Root colour")).toBeInTheDocument();
    expect(screen.queryByText("Shampoo")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Products" }));

    expect(screen.getByText("Shampoo")).toBeInTheDocument();
  });
});

describe("the cart", () => {
  it("adds a line and totals it in cents", async () => {
    const user = userEvent.setup();
    renderSale();

    await user.click(screen.getByRole("button", { name: "Add Root colour to the cart, $80.00" }));

    expect(within(cartPanel()).getByText("1 line · 1 item")).toBeInTheDocument();
    // Twice: the line's own total and the cart's total — one item at one price.
    expect(within(cartPanel()).getAllByText("$80.00")).toHaveLength(2);
    expect(screen.getByLabelText("Quantity of Root colour")).toHaveValue(1);
  });

  it("grows a line rather than adding a second one", async () => {
    const user = userEvent.setup();
    renderSale();

    // A product lives on the Products tab, and only the active panel is drawn.
    await user.click(screen.getByRole("tab", { name: "Products" }));

    const add = screen.getByRole("button", { name: "Add Shampoo to the cart, $12.50" });
    await user.click(add);
    await user.click(add);

    expect(within(cartPanel()).getByText("1 line · 2 items")).toBeInTheDocument();
    expect(within(cartPanel()).getAllByText("$25.00")).toHaveLength(2);
  });

  it("re-prices every line for the customer's membership", async () => {
    const user = userEvent.setup();
    renderSale();

    await user.click(screen.getByRole("button", { name: "Add Root colour to the cart, $80.00" }));
    expect(within(cartPanel()).getAllByText("$80.00")).toHaveLength(2);

    // The member price is applied by the cart, not at add time — the search returns
    // both prices for exactly this reason.
    await user.type(screen.getByLabelText("Attach a customer by name or phone"), "Mrs");
    await user.click(await screen.findByRole("button", { name: "Attach Mrs Loi, member" }));

    await waitFor(() => {
      expect(within(cartPanel()).getAllByText("$70.00")).toHaveLength(2);
    });
  });
});

describe("taking payment", () => {
  it("posts the whole cart with one idempotency key and draws the receipt", async () => {
    const user = userEvent.setup();
    renderSale();

    await user.click(screen.getByRole("button", { name: "Add Root colour to the cart, $80.00" }));
    await user.click(screen.getByRole("button", { name: "Take payment" }));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Take payment" }));

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith("/sales", {
        lines: [{ itemType: "SERVICE", itemId: "s1", quantity: 1 }],
        payments: [{ method: "CASH", amount: 80 }],
        // Q16: minted per attempt, so a double-tap replays rather than re-charges.
        idempotencyKey: expect.stringMatching(/^[0-9a-f-]{32,36}$/),
      });
    });

    // The receipt replaces the till: the grid is gone and one action is offered.
    expect(await screen.findByText("Receipt #1042")).toBeInTheDocument();
    expect(screen.getByText("Sale rung up as receipt #1042.")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Services" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New sale" }));

    // The cart was cleared by the write itself (`useCreateSale`), so the next sale
    // starts from nothing rather than from the last customer's shopping.
    expect(screen.getByRole("tab", { name: "Services" })).toBeInTheDocument();
    expect(within(cartPanel()).getByText("The cart is empty")).toBeInTheDocument();
    expect(within(cartPanel()).queryByText("1 line · 1 item")).not.toBeInTheDocument();
  });

  it("mints a fresh key per attempt, so a second attempt is a second sale", async () => {
    const user = userEvent.setup();
    renderSale();

    await user.click(screen.getByRole("button", { name: "Add Root colour to the cart, $80.00" }));

    await user.click(screen.getByRole("button", { name: "Take payment" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Take payment" }),
    );
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));

    // Dismiss the receipt, which is what closes the first attempt's dialog.
    await user.click(await screen.findByRole("button", { name: "New sale" }));

    await user.click(screen.getByRole("button", { name: "Add Root colour to the cart, $80.00" }));
    await user.click(screen.getByRole("button", { name: "Take payment" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Take payment" }),
    );
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));

    const [first, second] = post.mock.calls;
    expect(first?.[1].idempotencyKey).not.toBe(second?.[1].idempotencyKey);
  });

  it("will not post a granting cart until a customer is attached", async () => {
    const user = userEvent.setup();
    useSaleItems.mockReturnValue(
      itemsResult(["SERVICE", "PRODUCT", "PACKAGE"], [SERVICE, PACKAGE]),
    );
    renderSale();

    // The bundle is on its own tab, which exists only because the server named it.
    await user.click(screen.getByRole("tab", { name: "Packages" }));
    await user.click(
      screen.getByRole("button", { name: "Add Five-cut bundle to the cart, $250.00" }),
    );
    await user.click(screen.getByRole("button", { name: "Take payment" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Pick a customer first/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Take payment" })).toBeDisabled();
    expect(post).not.toHaveBeenCalled();
  });

  it("keeps the dialog open with the server's own reason", async () => {
    const user = userEvent.setup();
    getErrorMessage.mockReturnValue("That customer does not exist.");
    post.mockRejectedValue(new Error("Not found"));

    renderSale();
    await user.click(screen.getByRole("button", { name: "Add Root colour to the cart, $80.00" }));
    await user.click(screen.getByRole("button", { name: "Take payment" }));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Take payment" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "That customer does not exist.",
    );
    // Still open, so the cashier can fix it and retry the same attempt.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("a suspended salon", () => {
  it("cannot fill a cart at all", async () => {
    isReadOnly.value = true;
    const user = userEvent.setup();
    renderSale();

    await user.click(screen.getByRole("button", { name: "Add Root colour to the cart, $80.00" }));

    expect(within(cartPanel()).getByText("The cart is empty")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Take payment" })).not.toBeInTheDocument();
  });
});
