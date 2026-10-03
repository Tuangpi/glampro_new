/**
 * The two route gates, kept apart from `RouteWrapper` so each file exports only
 * components and Fast Refresh can track both.
 *
 * Both hold `loading` rather than redirecting: the cold-start
 * `GET /api/auth/me` has not answered yet, and treating that as "signed out"
 * would bounce a signed-in user to the login screen on every reload.
 */
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

import PageLoading from "@/components/ui/PageLoading";
import { useAuth } from "@/contexts/AuthContext";

/**
 * The gate for everything inside the application shell.
 *
 * The current path is carried as `?next=`, which is what makes
 * `roadmap.md`'s "return to where they came from" true rather than aspirational.
 * It is read back and validated on the login screen.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") return <PageLoading />;

  if (status === "anonymous") {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  return <>{children}</>;
}

/**
 * The inverse gate, for the login screen itself: a signed-in user who navigates
 * to `/login` goes to the dashboard rather than seeing a form that would only
 * hand them back a session they already have.
 */
export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  if (status === "loading") return <PageLoading />;
  if (status === "authenticated") return <Navigate to="/" replace />;

  return <>{children}</>;
}
