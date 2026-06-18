import { Request, Response } from 'express';
import {
  authService,
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_PATH,
  refreshTokenCookieOptions,
  refreshTokenMaxAgeMs,
} from '../services/auth.service';
import { sendOtp, verifyOtp } from '../services/otp.service';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthenticatedRequest } from '../middleware/authenticate';
import { ApiError } from '../utils/ApiError';
import { env } from '../config/env';
import type {
  RegisterInput,
  LoginInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  ChangePasswordInput,
  UpdateProfileInput,
  SendOtpInput,
  VerifyOtpInput,
} from '../validations/auth.schema';

/** Sets the httpOnly refresh_token cookie and strips refreshToken from the JSON body (ADR-AUTH-001). */
function respondWithTokens<T extends { refreshToken: string }>(
  res: Response,
  status: number,
  result: T
) {
  const { refreshToken, ...rest } = result;
  res.cookie(
    REFRESH_TOKEN_COOKIE_NAME,
    refreshToken,
    refreshTokenCookieOptions(env.NODE_ENV === 'production', refreshTokenMaxAgeMs(refreshToken))
  );
  res.status(status).json({ success: true, data: rest });
}

export const authController = {
  register: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.register(req.body as RegisterInput);
    respondWithTokens(res, 201, result);
  }),

  login: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.login(req.body as LoginInput, req.ip);
    respondWithTokens(res, 200, result);
  }),

  logout: asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user.id;
    await authService.logout(userId);
    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, { path: REFRESH_TOKEN_COOKIE_PATH });
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  }),

  // Refresh token travels via the httpOnly refresh_token cookie, never the
  // body. The x-refresh header is a lightweight CSRF guard for this cookie —
  // same pattern as enforceImpersonationCsrf in middleware/impersonation.ts.
  refresh: asyncHandler(async (req: Request, res: Response) => {
    if (req.headers['x-refresh'] !== '1') {
      throw new ApiError(403, 'Missing refresh CSRF header', true, { code: 'REFRESH_CSRF_MISSING' });
    }

    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME];
    if (!refreshToken) {
      throw ApiError.unauthorized('Refresh token missing');
    }

    const tokens = await authService.refreshTokens(refreshToken);

    res.cookie(
      REFRESH_TOKEN_COOKIE_NAME,
      tokens.refreshToken,
      refreshTokenCookieOptions(env.NODE_ENV === 'production', refreshTokenMaxAgeMs(tokens.refreshToken))
    );
    res.status(200).json({ success: true, data: { accessToken: tokens.accessToken } });
  }),

  getMe: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const [user, impersonation] = await Promise.all([
      authService.getMe(authReq.user.id),
      authService.getImpersonationSession(authReq.impersonation),
    ]);
    res.status(200).json({ success: true, data: { ...user, impersonation } });
  }),

  updateMe: asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user.id;
    const user = await authService.updateProfile(userId, req.body as UpdateProfileInput);
    res.status(200).json({ success: true, data: user });
  }),

  changePassword: asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user.id;
    await authService.changePassword(userId, req.body as ChangePasswordInput);
    res.status(200).json({ success: true, message: 'Password changed successfully' });
  }),

  forgotPassword: asyncHandler(async (req: Request, res: Response) => {
    await authService.forgotPassword(req.body as ForgotPasswordInput);
    res.status(200).json({
      success: true,
      message: 'If this email is registered, you will receive a reset link shortly',
    });
  }),

  resetPassword: asyncHandler(async (req: Request, res: Response) => {
    await authService.resetPassword(req.body as ResetPasswordInput);
    res.status(200).json({ success: true, message: 'Password has been reset successfully' });
  }),

  validateInviteCode: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.validateInviteCode(req.params.code);
    res.status(200).json({ success: true, data: result });
  }),

  sendOtp: asyncHandler(async (req: Request, res: Response) => {
    const { userId, purpose, phone } = req.body as SendOtpInput;
    const result = await sendOtp(purpose, userId, phone);
    res.status(200).json({ success: result.success, message: result.message });
  }),

  verifyOtp: asyncHandler(async (req: Request, res: Response) => {
    const { userId, purpose, otp } = req.body as VerifyOtpInput;
    const result = await verifyOtp(purpose, userId, otp);
    res.status(200).json({ valid: result.valid, message: result.message });
  }),
};
