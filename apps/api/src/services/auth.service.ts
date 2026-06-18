import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Role } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { redis } from '../config/redis';
import { ApiError } from '../utils/ApiError';
import { platformSettingsService } from './platformSettings.service';
import type { ImpersonationClaim } from '../middleware/impersonation';
import type {
  RegisterInput,
  LoginInput,
  ChangePasswordInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  UpdateProfileInput,
} from '../validations/auth.schema';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BCRYPT_ROUNDS = 12;
const BCRYPT_REFRESH_ROUNDS = 10; // Refresh tokens are already long random strings

// Failed-login escalation: count attempts per email within a rolling window
// and write a security AuditLog entry once the threshold is crossed.
const FAILED_LOGIN_THRESHOLD = 5;
const FAILED_LOGIN_WINDOW_SEC = 15 * 60;
const failedLoginKey = (email: string) => `failed_login:${email}`;

function issueTokenPair(payload: JwtPayload): TokenPair {
  const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  } as jwt.SignOptions);

  const refreshToken = jwt.sign(
    { sub: payload.sub },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN } as jwt.SignOptions
  );

  return { accessToken, refreshToken };
}

// ─── Refresh token cookie (ADR-AUTH-001) ────────────────────────────────────
// Refresh tokens are never returned in the JSON body and never read by JS —
// they live in an httpOnly cookie scoped to the /auth endpoints only, mirroring
// the impersonation_token cookie pattern in middleware/impersonation.ts. Access
// tokens are unaffected: still Authorization: Bearer + in-memory on the client.

export const REFRESH_TOKEN_COOKIE_NAME = 'refresh_token';
export const REFRESH_TOKEN_COOKIE_PATH = '/api/v1/auth';

export function refreshTokenCookieOptions(secure: boolean, maxAgeMs: number) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'strict' as const,
    path: REFRESH_TOKEN_COOKIE_PATH,
    maxAge: maxAgeMs,
  };
}

/** Derives the cookie's maxAge from the refresh JWT's own `exp` claim, so the cookie and the token expire in lockstep. */
export function refreshTokenMaxAgeMs(token: string): number {
  const decoded = jwt.decode(token) as { exp?: number } | null;
  return decoded?.exp ? Math.max(0, decoded.exp * 1000 - Date.now()) : 0;
}

const safeUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  phone: true,
  avatarUrl: true,
  isEmailVerified: true,
  lastLoginAt: true,
  createdAt: true,
  organisationId: true,
  isPlatformAdmin: true,
  platformRole: true,
} as const;

/** Adds the `displayName` field the frontend uses for nav/profile UI. */
function withDisplayName<T extends { firstName: string; lastName: string }>(
  user: T
): T & { displayName: string } {
  return { ...user, displayName: `${user.firstName} ${user.lastName}`.trim() };
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const authService = {
  async register(data: RegisterInput) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw ApiError.conflict('An account with this email already exists');
    }

    let organisationId: string | null = null;
    let role: Role = data.role;
    let invite: { id: string; organisationId: string; role: Role } | null = null;

    if (data.inviteCode) {
      const found = await prisma.inviteCode.findUnique({ where: { code: data.inviteCode } });

      if (!found || !found.isActive || found.usedBy || found.expiresAt < new Date()) {
        throw ApiError.badRequest('Invite code is invalid or has expired');
      }

      invite = { id: found.id, organisationId: found.organisationId, role: found.role };
      organisationId = found.organisationId;
      role = found.role;
    }

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: data.email,
          phone: data.phone,
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          role,
          organisationId,
        },
        select: safeUserSelect,
      });

      if (invite) {
        await tx.inviteCode.update({
          where: { id: invite.id },
          data: { usedBy: created.id, usedAt: new Date(), isActive: false },
        });
      }

      return created;
    });

    const tokens = issueTokenPair({ sub: user.id, email: user.email, role: user.role });
    const refreshTokenHash = await bcrypt.hash(tokens.refreshToken, BCRYPT_REFRESH_ROUNDS);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash },
    });

    logger.info('User registered', { userId: user.id, role: user.role });

    return { user: withDisplayName(user), ...tokens };
  },

  async login(data: LoginInput, ipAddress?: string) {
    const user = await prisma.user.findUnique({ where: { email: data.email } });

    // Constant-time comparison even when user doesn't exist (prevents timing attacks)
    const dummyHash = '$2a$12$FixedDummyHashUsedWhenUserNotFoundToPreventTimingLeak';
    const passwordMatch = await bcrypt.compare(
      data.password,
      user?.passwordHash ?? dummyHash
    );

    if (!user || !user.isActive || !passwordMatch) {
      await this.recordFailedLogin(data.email, user?.id, ipAddress);
      throw ApiError.unauthorized('Invalid email or password');
    }

    if (!user.isPlatformAdmin && (await platformSettingsService.isMaintenanceModeEnabled())) {
      throw ApiError.serviceUnavailable('GeoLand Pro is undergoing scheduled maintenance — please try again shortly');
    }

    await redis.del(failedLoginKey(data.email)).catch(() => undefined);

    const tokens = issueTokenPair({ sub: user.id, email: user.email, role: user.role });
    const refreshTokenHash = await bcrypt.hash(tokens.refreshToken, BCRYPT_REFRESH_ROUNDS);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash, lastLoginAt: new Date() },
    });

    logger.info('User logged in', { userId: user.id });

    return {
      user: withDisplayName({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        isEmailVerified: user.isEmailVerified,
        lastLoginAt: user.lastLoginAt,
        organisationId: user.organisationId,
        isPlatformAdmin: user.isPlatformAdmin,
        platformRole: user.platformRole,
      }),
      ...tokens,
    };
  },

  async refreshTokens(refreshToken: string) {
    let payload: { sub: string };
    try {
      payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as { sub: string };
    } catch {
      throw ApiError.unauthorized('Invalid or expired refresh token');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub, isActive: true },
    });

    if (!user?.refreshTokenHash) {
      throw ApiError.unauthorized('Session not found — please log in again');
    }

    const isTokenValid = await bcrypt.compare(refreshToken, user.refreshTokenHash);

    if (!isTokenValid) {
      // Token reuse detected — revoke the entire session (refresh token rotation)
      await prisma.user.update({
        where: { id: user.id },
        data: { refreshTokenHash: null },
      });
      logger.warn('Refresh token reuse detected — session revoked', { userId: user.id });
      throw ApiError.unauthorized('Session has been invalidated — please log in again');
    }

    const tokens = issueTokenPair({ sub: user.id, email: user.email, role: user.role });
    const newRefreshHash = await bcrypt.hash(tokens.refreshToken, BCRYPT_REFRESH_ROUNDS);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: newRefreshHash },
    });

    return tokens;
  },

  async logout(userId: string) {
    await prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
    logger.info('User logged out', { userId });
  },

  async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: safeUserSelect,
    });
    if (!user) throw ApiError.notFound('User');
    return withDisplayName(user);
  },

  /** Resolves the active impersonation claim (if any) into banner-ready session info, including the target org's display name. */
  async getImpersonationSession(claim: ImpersonationClaim | undefined) {
    if (!claim) return null;

    const organisation = await prisma.organisation.findUnique({
      where: { id: claim.organisationId },
      select: { id: true, name: true, slug: true },
    });

    return {
      requestId: claim.requestId,
      organisation,
      grantedScopes: claim.grantedScopes,
      readOnly: claim.readOnly,
      expiresAt: claim.expiresAt,
    };
  },

  async updateProfile(userId: string, data: UpdateProfileInput) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.firstName && { firstName: data.firstName }),
        ...(data.lastName && { lastName: data.lastName }),
        ...(data.phone !== undefined && { phone: data.phone }),
      },
      select: safeUserSelect,
    });
    return withDisplayName(user);
  },

  async changePassword(userId: string, data: ChangePasswordInput) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw ApiError.notFound('User');

    const isCurrentValid = await bcrypt.compare(data.currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      throw ApiError.unauthorized('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(data.newPassword, BCRYPT_ROUNDS);

    // Invalidate all sessions on password change
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash, refreshTokenHash: null },
    });

    logger.info('Password changed — all sessions invalidated', { userId });
  },

  async forgotPassword(data: ForgotPasswordInput) {
    const user = await prisma.user.findUnique({ where: { email: data.email } });

    // Always respond with success to prevent email enumeration
    if (!user || !user.isActive) {
      logger.info('Forgot password requested for unknown email', { email: data.email });
      return;
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetToken,
        passwordResetExpiry: resetTokenExpiry,
      },
    });

    // TODO: Enqueue email via notification job queue
    // await notificationQueue.add('send-password-reset', { userId: user.id, token: resetToken });

    logger.info('Password reset token issued', { userId: user.id });
  },

  async resetPassword(data: ResetPasswordInput) {
    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: data.token,
        passwordResetExpiry: { gt: new Date() },
        isActive: true,
      },
    });

    if (!user) {
      throw ApiError.badRequest('Reset token is invalid or has expired');
    }

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiry: null,
        refreshTokenHash: null, // Invalidate all sessions after reset
      },
    });

    logger.info('Password reset successfully', { userId: user.id });
  },

  async validateInviteCode(code: string) {
    const invite = await prisma.inviteCode.findUnique({
      where: { code },
      select: {
        isActive: true,
        usedBy: true,
        expiresAt: true,
        role: true,
        organisation: { select: { name: true } },
      },
    });

    if (!invite || !invite.isActive || invite.usedBy || invite.expiresAt < new Date()) {
      return { valid: false as const };
    }

    return {
      valid: true as const,
      organisationName: invite.organisation.name,
      role: invite.role,
      expiresAt: invite.expiresAt,
    };
  },

  /** Tracks failed login attempts per email and escalates to the security audit log once the threshold is crossed. */
  async recordFailedLogin(email: string, userId: string | undefined, ipAddress: string | undefined) {
    try {
      const key = failedLoginKey(email);
      const attempts = await redis.incr(key);
      if (attempts === 1) {
        await redis.expire(key, FAILED_LOGIN_WINDOW_SEC);
      }

      if (attempts >= FAILED_LOGIN_THRESHOLD) {
        logger.warn('Failed login threshold exceeded', { email, attempts, ipAddress });

        if (userId) {
          await prisma.auditLog.create({
            data: {
              userId,
              action: 'LOGIN_FAILED_THRESHOLD',
              entityType: 'User',
              entityId: userId,
              metadata: { email, attempts },
              ipAddress,
            },
          });
        }
      }
    } catch (err) {
      logger.error('Failed to record failed login attempt', { email, error: (err as Error).message });
    }
  },
};
