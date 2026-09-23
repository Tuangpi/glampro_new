import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';

/** Gate for authenticated areas: waits for the session bootstrap, then redirects. */
export const RequireAuth = () => {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <p className="panel px-6 py-4 text-xs font-bold text-muted">Restoring your session…</p>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    // The full path (including any query string, such as an invitation token)
    // survives the round trip through the login page.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <Outlet />;
};
