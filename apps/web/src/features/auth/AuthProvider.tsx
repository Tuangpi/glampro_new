import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  AuthenticatedSession,
  AuthenticatedUser,
  LocationSummary,
  MembershipSummary,
} from '@glampro/contracts';
import {
  fetchCurrentUser,
  loginUser,
  refreshSession,
  registerOrganization,
  setSessionRefreshHandler,
  signOut,
} from '../../lib/api';
import { AuthContext, type AuthContextValue, type AuthState, signedOutState } from './AuthContext';

type AuthenticatedStateInput = {
  accessToken: string;
  user: AuthenticatedUser;
  organizations: MembershipSummary[];
  activeOrganizationId: string | null;
  permissions: string[];
  locations: LocationSummary[];
};

const authenticatedState = (input: AuthenticatedStateInput): AuthState => ({
  status: 'authenticated',
  accessToken: input.accessToken,
  user: input.user,
  organizations: input.organizations,
  activeOrganizationId: input.activeOrganizationId,
  activeMembership:
    input.organizations.find(
      (membership) => membership.organizationId === input.activeOrganizationId,
    ) ?? null,
  permissions: input.permissions,
  locations: input.locations,
});

/**
 * Holds the session in memory. The refresh token lives in an HTTP-only cookie,
 * so a reload silently restores the session instead of reading stored tokens.
 */
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AuthState>({ ...signedOutState, status: 'loading' });

  const loadSession = useCallback(async () => {
    try {
      const { accessToken } = await refreshSession();
      const currentUser = await fetchCurrentUser({ accessToken });

      setState(
        authenticatedState({
          accessToken,
          user: currentUser.user,
          organizations: currentUser.membership ? [currentUser.membership] : [],
          activeOrganizationId: currentUser.activeOrganizationId,
          permissions: currentUser.permissions,
          locations: currentUser.locations,
        }),
      );
    } catch {
      setState(signedOutState);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  /** API calls that race the access token expiry renew it through this handler. */
  useEffect(() => {
    setSessionRefreshHandler(async () => {
      try {
        const { accessToken } = await refreshSession();
        setState((current) => ({ ...current, accessToken }));
        return accessToken;
      } catch {
        setState(signedOutState);
        return null;
      }
    });

    return () => {
      setSessionRefreshHandler(null);
    };
  }, []);

  const applySession = useCallback(async (session: AuthenticatedSession) => {
    const currentUser = await fetchCurrentUser({
      accessToken: session.accessToken,
      organizationId: session.activeOrganizationId,
    });

    setState(
      authenticatedState({
        accessToken: session.accessToken,
        user: currentUser.user,
        organizations: session.organizations,
        activeOrganizationId: currentUser.activeOrganizationId,
        permissions: currentUser.permissions,
        locations: currentUser.locations,
      }),
    );
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      hasPermission: (permission) => state.permissions.includes(permission),
      signIn: async (input) => applySession(await loginUser(input)),
      register: async (input) => applySession(await registerOrganization(input)),
      signOutUser: async () => {
        try {
          await signOut();
        } finally {
          setState(signedOutState);
        }
      },
      reloadSession: loadSession,
    }),
    [applySession, state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
