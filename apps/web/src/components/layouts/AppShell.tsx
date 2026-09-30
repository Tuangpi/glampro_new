import { useState } from "react";
import { FiBell, FiLogOut, FiPlus, FiSearch } from "react-icons/fi";
import { NavLink, Outlet, useLocation } from "react-router";

import { activeNavItem, visibleNavItems } from "@/constants/navigation";
import { cn, getInitials } from "@/lib/utils";

/**
 * The Salon Pro application frame (handoff screens 05–11):
 * an 84px navy icon rail on the left and a 76px white top bar above the page.
 *
 * The rail collapse, search behaviour and notification tray are wired up in the
 * design-system and auth phases; the geometry and typography match the handoff
 * today so every page inherits the right frame.
 */
export default function AppShell() {
  const location = useLocation();
  const items = visibleNavItems();
  const current = activeNavItem(location.pathname);
  const [search, setSearch] = useState("");

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="fixed inset-y-0 left-0 z-40 flex w-[84px] flex-col items-center bg-navy py-5">
        <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-md bg-gradient-to-br from-[var(--sp-purple-grad-a)] to-[var(--sp-purple-grad-b)] text-base font-extrabold text-white">
          G
        </div>

        <nav className="flex flex-1 flex-col items-center gap-1 overflow-y-auto scrollbar-hide">
          {items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                cn(
                  "group relative flex w-[66px] flex-col items-center gap-1.5 rounded-md py-2.5 transition",
                  isActive
                    ? "bg-[var(--sp-navy-tint-14)] text-white"
                    : "text-ink-on-dark hover:bg-[var(--sp-navy-tint-10)] hover:text-white",
                )
              }
            >
              <item.icon className="text-[19px]" aria-hidden />
              <span className="text-[10px] font-semibold tracking-wide">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          className="mt-4 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--sp-navy-tint-10)] text-ink-on-dark transition hover:text-white"
          aria-label="Sign out"
        >
          <FiLogOut />
        </button>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col pl-[84px]">
        <header className="sticky top-0 z-30 flex h-[76px] items-center gap-5 border-b border-line bg-surface px-7">
          <div className="min-w-0">
            <h1 className="truncate text-lg leading-tight">{current?.label ?? "Glampro"}</h1>
            <p className="text-xs text-ink-muted">Glampro Salon — {weekdayToday()}</p>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <label className="hidden h-control w-[260px] items-center gap-2 rounded-md bg-surface-2 px-3.5 lg:flex">
              <FiSearch className="shrink-0 text-ink-muted" aria-hidden />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search customers, items…"
                aria-label="Global search"
                className="h-full flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
              />
            </label>

            <button
              type="button"
              className="flex h-control w-control items-center justify-center rounded-md bg-surface-2 text-ink-body transition hover:bg-line-soft"
              aria-label="Notifications"
            >
              <FiBell />
            </button>

            <button
              type="button"
              className="flex h-control items-center gap-2 rounded-md bg-purple px-4 text-sm font-semibold text-white shadow-purple-btn transition hover:bg-purple-dark"
            >
              <FiPlus aria-hidden />
              New sale
            </button>

            <div className="flex items-center gap-2.5 pl-1">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-soft text-xs font-bold text-purple">
                {getInitials("Glampro Admin")}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 px-7 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function weekdayToday(): string {
  return new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}
