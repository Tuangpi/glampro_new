import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { formatMoney } from "@/lib/utils";
import EmptyState from "../EmptyState";
import Table, { type TableColumn } from "../Table";

interface Customer {
  id: string;
  name: string;
  balance: number;
}

const CUSTOMERS: Customer[] = [
  { id: "c1", name: "Maria Santos", balance: 12_500 },
  { id: "c2", name: "Juan Reyes", balance: 0 },
];

const COLUMNS: TableColumn<Customer>[] = [
  { key: "name", header: "Customer", cell: (row) => row.name },
  {
    key: "balance",
    header: "Balance",
    align: "right",
    cell: (row) => formatMoney(row.balance),
  },
];

describe("Table", () => {
  it("carries a caption for assistive technology", () => {
    render(
      <Table
        caption="Customers with an outstanding balance"
        columns={COLUMNS}
        rows={CUSTOMERS}
        rowKey={(row) => row.id}
      />,
    );

    expect(
      screen.getByRole("table", { name: "Customers with an outstanding balance" }),
    ).toBeInTheDocument();
  });

  it("renders the column headers in order", () => {
    render(
      <Table caption="Customers" columns={COLUMNS} rows={CUSTOMERS} rowKey={(row) => row.id} />,
    );

    const headers = screen.getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent)).toEqual(["Customer", "Balance"]);
  });

  it("renders one row per record", () => {
    render(
      <Table caption="Customers" columns={COLUMNS} rows={CUSTOMERS} rowKey={(row) => row.id} />,
    );

    // The header row is not a row of data.
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getByText("Maria Santos")).toBeInTheDocument();
    expect(screen.getByText("$125.00")).toBeInTheDocument();
  });

  it("right-aligns a column that asks for it", () => {
    render(
      <Table caption="Customers" columns={COLUMNS} rows={CUSTOMERS} rowKey={(row) => row.id} />,
    );

    expect(screen.getByRole("columnheader", { name: "Balance" })).toHaveClass("text-right");
    expect(screen.getByRole("columnheader", { name: "Customer" })).toHaveClass("text-left");
  });

  it("replaces the table with the empty state when there is nothing to show", () => {
    render(
      <Table
        caption="Customers"
        columns={COLUMNS}
        rows={[]}
        rowKey={(row) => row.id}
        empty={<EmptyState title="No customers yet" />}
      />,
    );

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("No customers yet")).toBeInTheDocument();
  });

  it("still renders the table when there are no rows and no empty state", () => {
    render(<Table caption="Customers" columns={COLUMNS} rows={[]} rowKey={(row) => row.id} />);

    expect(screen.getByRole("table", { name: "Customers" })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(1);
  });

  it("renders a footer for totals", () => {
    render(
      <Table
        caption="Customers"
        columns={COLUMNS}
        rows={CUSTOMERS}
        rowKey={(row) => row.id}
        footer={
          <tr>
            <td>Total</td>
            <td>$125.00</td>
          </tr>
        }
      />,
    );

    expect(screen.getByText("Total")).toBeInTheDocument();
  });
});
