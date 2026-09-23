import { z } from 'zod';
import { apiEnvelopeSchema } from './api.js';
import {
  locationSummarySchema,
  membershipSummarySchema,
  platformRoleSchema,
} from './organization.js';

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const passwordSchema = z
  .string()
  .min(12)
  .max(128)
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[0-9]/, 'Password must include a number');

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const registrationRequestSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: emailSchema,
  password: passwordSchema,
  organizationName: z.string().trim().min(2).max(160),
  locationName: z.string().trim().min(2).max(160),
  timezone: z.string().trim().min(1).max(100).default('Asia/Singapore'),
});

export const forgotPasswordRequestSchema = z.object({
  email: emailSchema,
});

export const resetPasswordRequestSchema = z.object({
  token: z.string().trim().min(1).max(512),
  password: passwordSchema,
});

export const emailVerificationRequestSchema = z.object({
  token: z.string().trim().min(1).max(512),
});

export const authenticatedUserSchema = z.object({
  id: z.string().min(1),
  email: emailSchema,
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  avatarUrl: z.string().nullable(),
  platformRole: platformRoleSchema,
  emailVerifiedAt: z.iso.datetime().nullable(),
});

/** Payload returned by registration, login, and any future re-issue of a session. */
export const authenticatedSessionDataSchema = z.object({
  user: authenticatedUserSchema,
  accessToken: z.string().min(1),
  accessTokenExpiresAt: z.iso.datetime(),
  organizations: z.array(membershipSummarySchema),
  activeOrganizationId: z.string().nullable(),
  permissions: z.array(z.string().min(1)),
  csrfToken: z.string().min(1),
});

export const refreshSessionDataSchema = z.object({
  accessToken: z.string().min(1),
  accessTokenExpiresAt: z.iso.datetime(),
  csrfToken: z.string().min(1),
});

export const currentUserDataSchema = z.object({
  user: authenticatedUserSchema,
  activeOrganizationId: z.string().nullable(),
  membership: membershipSummarySchema.nullable(),
  permissions: z.array(z.string().min(1)),
  locations: z.array(locationSummarySchema),
});

export const sessionSummarySchema = z.object({
  id: z.string().min(1),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  isCurrent: z.boolean(),
});

export const sessionsDataSchema = z.object({
  sessions: z.array(sessionSummarySchema),
});

export const logoutDataSchema = z.object({
  revokedSessions: z.number().int().nonnegative(),
});

export const csrfDataSchema = z.object({
  csrfToken: z.string().min(1),
});

export const passwordResetRequestedDataSchema = z.object({
  requested: z.literal(true),
});

export const passwordResetCompletedDataSchema = z.object({
  completed: z.literal(true),
});

export const emailVerifiedDataSchema = z.object({
  verified: z.literal(true),
});

export const loginResponseSchema = apiEnvelopeSchema(authenticatedSessionDataSchema);
export const registrationResponseSchema = apiEnvelopeSchema(authenticatedSessionDataSchema);
export const refreshResponseSchema = apiEnvelopeSchema(refreshSessionDataSchema);
export const currentUserResponseSchema = apiEnvelopeSchema(currentUserDataSchema);
export const sessionsResponseSchema = apiEnvelopeSchema(sessionsDataSchema);
export const logoutResponseSchema = apiEnvelopeSchema(logoutDataSchema);
export const csrfResponseSchema = apiEnvelopeSchema(csrfDataSchema);
export const passwordResetRequestedResponseSchema = apiEnvelopeSchema(
  passwordResetRequestedDataSchema,
);
export const passwordResetCompletedResponseSchema = apiEnvelopeSchema(
  passwordResetCompletedDataSchema,
);
export const emailVerifiedResponseSchema = apiEnvelopeSchema(emailVerifiedDataSchema);

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type RegistrationRequest = z.infer<typeof registrationRequestSchema>;
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
export type EmailVerificationRequest = z.infer<typeof emailVerificationRequestSchema>;
export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;
export type AuthenticatedSession = z.infer<typeof authenticatedSessionDataSchema>;
export type RefreshSession = z.infer<typeof refreshSessionDataSchema>;
export type CurrentUser = z.infer<typeof currentUserDataSchema>;
export type SessionSummary = z.infer<typeof sessionSummarySchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type RegistrationResponse = z.infer<typeof registrationResponseSchema>;
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;
export type CurrentUserResponse = z.infer<typeof currentUserResponseSchema>;
export type SessionsResponse = z.infer<typeof sessionsResponseSchema>;
export type LogoutResponse = z.infer<typeof logoutResponseSchema>;
export type CsrfResponse = z.infer<typeof csrfResponseSchema>;
export type PasswordResetRequestedResponse = z.infer<typeof passwordResetRequestedResponseSchema>;
export type PasswordResetCompletedResponse = z.infer<typeof passwordResetCompletedResponseSchema>;
export type EmailVerifiedResponse = z.infer<typeof emailVerifiedResponseSchema>;
