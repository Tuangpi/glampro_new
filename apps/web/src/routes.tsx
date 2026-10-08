import { lazy } from "react";
import type { RouteObject } from "react-router";

import AppShell from "@/components/layouts/AppShell";
import { ProtectedRoute, PublicOnlyRoute } from "@/components/layouts/RouteGuards";
import { lazyRoute } from "@/components/layouts/RouteWrapper";

// ── Lazy-loaded pages ──────────────────────────────────────────────
const Login = lazy(() => import("@/pages/Login"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Sale = lazy(() => import("@/pages/Sale"));
const Appointments = lazy(() => import("@/pages/Appointments"));
const Customers = lazy(() => import("@/pages/Customers"));
const Products = lazy(() => import("@/pages/Products"));
const Staff = lazy(() => import("@/pages/Staff"));
const Settings = lazy(() => import("@/pages/Settings"));
const NotFound = lazy(() => import("@/pages/NotFound"));

// ── Route tree ─────────────────────────────────────────────────────
// Every rail destination is here except Reports, which the phase that builds
// screen 10 adds — the rail draws the entry already so its absence is visible
// rather than silent. There is no /services route: services are a tab on the
// products screen and a step in the sale and appointment flows (ADR 0005).
const routes: RouteObject[] = [
  {
    path: "/login",
    element: <PublicOnlyRoute>{lazyRoute(<Login />)}</PublicOnlyRoute>,
  },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: lazyRoute(<Dashboard />) },
      // Screens 01–02 (M1). No role guard: a cashier rings sales up, and the rail
      // already hides what a role may not use — hidden is not secured, so the
      // boundary is the API's `requireModule("sales")` either way.
      { path: "sale", element: lazyRoute(<Sale />) },
      { path: "appointments", element: lazyRoute(<Appointments />) },
      { path: "customers", element: lazyRoute(<Customers />) },
      { path: "products", element: lazyRoute(<Products />) },
      { path: "staff", element: lazyRoute(<Staff />) },
      // Screen 11. The API refuses the profile write for anyone else
      // (`requireRole("SUPER_ADMIN", "MANAGER")`), which is the actual boundary.
      { path: "settings", element: lazyRoute(<Settings />) },
      { path: "*", element: lazyRoute(<NotFound />) },
    ],
  },
];

export default routes;
