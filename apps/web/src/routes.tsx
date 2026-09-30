import { lazy } from "react";
import type { RouteObject } from "react-router";

import AppShell from "@/components/layouts/AppShell";
import { lazyRoute } from "@/components/layouts/RouteWrapper";

// ── Lazy-loaded pages ──────────────────────────────────────────────
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const NotFound = lazy(() => import("@/pages/NotFound"));

// ── Route tree ─────────────────────────────────────────────────────
// Feature routes (sale, appointments, customers, products, services,
// reports, settings) are added by the phase that builds them.
const routes: RouteObject[] = [
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: lazyRoute(<Dashboard />) },
      { path: "*", element: lazyRoute(<NotFound />) },
    ],
  },
];

export default routes;
