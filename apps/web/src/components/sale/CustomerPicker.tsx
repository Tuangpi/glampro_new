/**
 * The customer picker — the handoff's Walk-in chip plus a member search.
 *
 * A walk-in sale has no customer row (the legacy schema's non-null
 * `customer_id` is how that system ended up needing an invented "cash customer"
 * per salon), so the picker starts on a Walk-in chip and a search box only
 * attaches someone when the cashier picks them. Whether the member price
 * applies is read off the picked row: `isMember` means "carries a membership
 * reference" (`Customer.memberId`, free text from legacy's `member_id`) and
 * nothing more is invented.
 */
import { useState } from "react";

import type { CustomerSummary } from "@glampro/shared";

import { Search, User, Users, X } from "@/components/icons";
import Chip from "@/components/ui/Chip";
import Skeleton from "@/components/ui/Skeleton";
import { useSaleCustomers } from "@/hooks/useSale";

export interface CustomerPickerProps {
  customer: CustomerSummary | null;
  onSelect: (customer: CustomerSummary | null) => void;
  disabled: boolean;
}

export default function CustomerPicker({ customer, onSelect, disabled }: CustomerPickerProps) {
  const [searchInput, setSearchInput] = useState("");
  const results = useSaleCustomers(searchInput);

  const rows = results.data?.data ?? [];
  const open = searchInput.trim().length > 0 && !disabled;

  return (
    <section aria-label="Customer for this sale" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* A toggle chip rather than a select option: the default state of a
            sale is "nobody", and the chip keeps that visible instead of hiding
            it as the empty value of a dropdown. */}
        <Chip
          selected={customer === null}
          onSelect={customer === null ? undefined : () => onSelect(null)}
          disabled={disabled}
        >
          <span className="inline-flex items-center gap-1.5">
            <User aria-hidden />
            Walk-in
          </span>
        </Chip>

        {customer ? (
          <Chip icon={<Users />} onSelect={() => onSelect(null)} disabled={disabled}>
            {customer.name}
            <X aria-hidden className="text-xs" />
            <span className="sr-only">(clear the customer)</span>
          </Chip>
        ) : null}
      </div>

      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted"
        />
        <input
          type="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Attach a customer…"
          aria-label="Attach a customer by name or phone"
          disabled={disabled}
          className="h-control w-full rounded-md border border-line bg-surface pr-3 pl-9 text-sm text-ink transition-colors placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-purple disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-disabled"
        />
      </div>

      {open ? (
        <div className="rounded-card border border-line bg-surface">
          {results.isPending ? (
            <div className="flex flex-col gap-2 p-3" aria-busy aria-label="Searching customers">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-10" />
              ))}
            </div>
          ) : results.isError ? (
            <p className="px-4 py-3 text-sm text-danger">
              The customer search failed. Keep typing to retry.
            </p>
          ) : rows.length === 0 ? (
            <p className="px-4 py-3 text-sm text-ink-muted">
              No customers match “{searchInput.trim()}”. A walk-in sale needs none.
            </p>
          ) : (
            <ul aria-label="Matching customers" className="max-h-64 overflow-y-auto py-1">
              {rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(row);
                      setSearchInput("");
                    }}
                    aria-label={`Attach ${row.name}${row.memberId ? ", member" : ""}`}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-purple"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-ink">{row.name}</span>
                      <span className="block truncate text-xs text-ink-muted">
                        {row.phone ?? row.email ?? "No phone or email"}
                      </span>
                    </span>
                    {row.memberId ? (
                      <span className="shrink-0 rounded-pill bg-purple-soft px-2 py-0.5 text-2xs font-bold text-purple">
                        Member
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
