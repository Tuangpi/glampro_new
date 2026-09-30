import { z } from "zod";

import { AUTH_REALMS, GLOBAL_ROLES, PASSWORD_MIN_LENGTH } from "../constants.js";
import { emailSchema } from "./common.js";

export const authRealmSchema = z.enum(AUTH_REALMS);

export const globalRoleSchema = z.enum(GLOBAL_ROLES);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
  /** Defaults to the web portal when the caller does not specify a surface. */
  realm: authRealmSchema.default("web"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RefreshInput = z.infer<typeof refreshSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(PASSWORD_MIN_LENGTH).max(200),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const authUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: emailSchema,
  globalRole: globalRoleSchema,
});

export type AuthUser = z.infer<typeof authUserSchema>;

export const authSessionSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Access-token lifetime in seconds, so the client can schedule a refresh. */
  expiresIn: z.number().int().positive(),
  user: authUserSchema,
});

export type AuthSession = z.infer<typeof authSessionSchema>;
