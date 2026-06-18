import { z } from 'zod';
import { Role } from '@prisma/client';

// ─── Reusable field definitions ───────────────────────────────────────────────

const passwordField = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

const phoneField = z
  .string()
  .regex(/^\+?[0-9]{10,15}$/, 'Phone number must be 10–15 digits, optionally prefixed with +')
  .optional();

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const registerSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase(),
  phone: phoneField,
  password: passwordField,
  firstName: z.string().min(1).max(50).trim(),
  lastName: z.string().min(1).max(50).trim(),
  // SUPER_ADMIN cannot self-register — created by seeding only
  role: z
    .enum([Role.ADMIN, Role.MANAGER, Role.FIELD_SURVEYOR, Role.TENANT])
    .optional()
    .default(Role.TENANT),
  // If provided, the user joins the invite's organisation with the invite's role
  // (overriding the `role` field above). Without it, the account has no
  // organisation and waits for an admin to invite them.
  inviteCode: z.string().min(1).optional(),
});

export const validateInviteCodeParamSchema = z.object({
  code: z.string().min(1, 'Invite code is required'),
});

export const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

// The refresh token itself now travels in the httpOnly refresh_token cookie
// (see ADR-AUTH-001) — any body is ignored.
export const refreshTokenSchema = z.object({});

export const forgotPasswordSchema = z.object({
  email: z.string().email().toLowerCase(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: passwordField,
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordField,
    confirmPassword: z.string().min(1),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must differ from current password',
    path: ['newPassword'],
  });

export const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(50).trim().optional(),
  lastName: z.string().min(1).max(50).trim().optional(),
  phone: phoneField,
});

const otpPurposeField = z.enum(['admin_login', 'lease_sign', 'password_reset']);

export const sendOtpSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  purpose: otpPurposeField,
  phone: z
    .string()
    .regex(/^\+?[0-9]{10,15}$/, 'Phone number must be 10–15 digits, optionally prefixed with +'),
});

export const verifyOtpSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  purpose: otpPurposeField,
  otp: z.string().length(6, 'OTP must be 6 digits'),
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type RegisterInput = z.infer<typeof registerSchema>;
export type ValidateInviteCodeParams = z.infer<typeof validateInviteCodeParamSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type SendOtpInput = z.infer<typeof sendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
