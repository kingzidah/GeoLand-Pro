import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { authRateLimiter, refreshRateLimiter, otpRateLimiter } from '../middleware/rateLimit';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateProfileSchema,
  sendOtpSchema,
  verifyOtpSchema,
  validateInviteCodeParamSchema,
} from '../validations/auth.schema';

const router = Router();

// ─── Public routes (rate limited) ────────────────────────────────────────────

router.post(
  '/register',
  authRateLimiter,
  validate({ body: registerSchema }),
  authController.register
);

router.post(
  '/login',
  authRateLimiter,
  validate({ body: loginSchema }),
  authController.login
);

router.post(
  '/refresh',
  refreshRateLimiter,
  validate({ body: refreshTokenSchema }),
  authController.refresh
);

router.post(
  '/forgot-password',
  authRateLimiter,
  validate({ body: forgotPasswordSchema }),
  authController.forgotPassword
);

router.post(
  '/reset-password',
  authRateLimiter,
  validate({ body: resetPasswordSchema }),
  authController.resetPassword
);

router.post(
  '/send-otp',
  otpRateLimiter,
  validate({ body: sendOtpSchema }),
  authController.sendOtp
);

router.post(
  '/verify-otp',
  otpRateLimiter,
  validate({ body: verifyOtpSchema }),
  authController.verifyOtp
);

router.get(
  '/validate-invite/:code',
  validate({ params: validateInviteCodeParamSchema }),
  authController.validateInviteCode
);

// ─── Protected routes ────────────────────────────────────────────────────────

router.post('/logout', authenticate, authController.logout);

router.get('/me', authenticate, authController.getMe);

router.patch(
  '/me',
  authenticate,
  validate({ body: updateProfileSchema }),
  authController.updateMe
);

router.patch(
  '/change-password',
  authenticate,
  validate({ body: changePasswordSchema }),
  authController.changePassword
);

export default router;
