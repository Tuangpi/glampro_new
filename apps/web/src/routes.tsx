import { lazy } from "react";
import type { RouteObject } from "react-router";

import AppShell from "@/components/layouts/AppShell";
import { ProtectedRoute, PublicOnlyRoute } from "@/components/layouts/RouteGuards";
import { lazyRoute } from "@/components/layouts/RouteWrapper";

// ── Lazy-loaded pages ──────────────────────────────────────────────
const Login = lazy(() => import("@/pages/Login"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Customers = lazy(() => import("@/pages/Customers"));
const Products = lazy(() => import("@/pages/Products"));
const Staff = lazy(() => import("@/pages/Staff"));
const NotFound = lazy(() => import("@/pages/NotFound"));

// ── Route tree ─────────────────────────────────────────────────────
// Feature routes (sale, appointments, reports, settings) are added by the phase
// that builds them. There is no /services route: services are a tab on the products
// screen and a step in the sale and appointment flows (ADR 0005).
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
      { path: "customers", element: lazyRoute(<Customers />) },
      { path: "products", element: lazyRoute(<Products />) },
      { path: "staff", element: lazyRoute(<Staff />) },
      { path: "*", element: lazyRoute(<NotFound />) },
    ],
  },
];

export default routes;
