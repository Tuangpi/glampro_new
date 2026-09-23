import { z } from 'zod';

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

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type RegistrationRequest = z.infer<typeof registrationRequestSchema>;
