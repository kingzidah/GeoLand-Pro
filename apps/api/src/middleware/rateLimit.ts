import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import { ApiError } from '../utils/ApiError';

const createLimiter = (windowMs: number, max: number): RateLimitRequestHandler =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,  // Return RateLimit-* headers
    legacyHeaders: false,   // Disable X-RateLimit-* headers
    handler: (_req, _res, next) => {
      next(ApiError.tooManyRequests());
    },
    skipSuccessfulRequests: false,
  });

/** Strict limit for credential-based auth endpoints — protects against brute force */
export const authRateLimiter = createLimiter(15 * 60 * 1000, 10); // 10 req / 15 min

/** Looser limit for token refresh — fires on every page load, gated by token possession not guessable credentials */
export const refreshRateLimiter = createLimiter(15 * 60 * 1000, 60); // 60 req / 15 min

/** Standard limit applied to all /api/v1 routes */
export const apiRateLimiter = createLimiter(15 * 60 * 1000, 200); // 200 req / 15 min

/** Tight limit for document generation (CPU-heavy) */
export const documentRateLimiter = createLimiter(60 * 1000, 5); // 5 req / min

/** OTP request endpoints — prevent SMS/WhatsApp abuse */
export const otpRateLimiter = createLimiter(10 * 60 * 1000, 3); // 3 req / 10 min

/** AI endpoints — prevent cost runaway */
export const aiRateLimiter = createLimiter(60 * 1000, 20); // 20 req / min

/** File upload endpoints */
export const uploadRateLimiter = createLimiter(60 * 60 * 1000, 30); // 30 req / hour

/** Admin endpoints — moderate */
export const adminRateLimiter = createLimiter(60 * 1000, 50); // 50 req / min
