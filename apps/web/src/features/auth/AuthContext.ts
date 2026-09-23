import { createContext } from 'react';
import type {
  AuthenticatedUser,
  LocationSummary,
  LoginRequest,
  MembershipSummary,
  Permission,
  RegistrationRequest,
} from '@glampro/contracts';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export type AuthState = {
  status: AuthStatus;
  accessToken: string | null;
  user: AuthenticatedUser | null;
  organizations: MembershipSummary[];
  activeOrganizationId: string | null;
  activeMembership: MembershipSummary | null;
  permissions: string[];
  locations: LocationSummary[];
};

export type AuthContextValue = AuthState & {
  hasPermission: (permission: Permission) => boolean;
  signIn: (input: LoginRequest) => Promise<void>;
  register: (input: RegistrationRequest) => Promise<void>;
  signOutUser: () => Promise<void>;
};

export const signedOutState: AuthState = {
  status: 'unauthenticated',
  accessToken: null,
  user: null,
  organizations: [],
  activeOrganizationId: null,
  activeMembership: null,
  permissions: [],
  locations: [],
};

export const AuthContext = createContext<AuthContextValue | null>(null);
