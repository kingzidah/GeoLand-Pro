import { Request, Response, NextFunction } from 'express';
import type { Role } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import {
  applyImpersonationEnforcement,
  resolveAccessToken,
  enforceImpersonationCsrf,
  isImpersonationLifecycleRoute,
  type AuthenticatedRequest,
  type ImpersonationClaim,
} from './impersonation';
import { assertImpersonationSessionLive } from '../services/impersonationSession.service';

export { applyImpersonationEnforcement, resolveAccessToken, enforceImpersonationCsrf };
export type { AuthenticatedRequest, ImpersonationClaim };

interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  iat: number;
  exp: number;
  impersonation?: ImpersonationClaim;
}

/**
 * Authenticates the request and applies impersonation enforcement.
 *
 * Access-token precedence (cookie vs. header): see resolveAccessToken in
 * ./impersonation for the full rule — in short, an `impersonation_token`
 * cookie, if present, governs the request entirely (the Authorization
 * header is ignored even if the cookie is invalid/expired); otherwise this
 * falls back to Authorization: Bearer for the primary session.
 */
export const authenticate = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const { payload, isImpersonationCookie } = resolveAccessToken<AccessTokenPayload>(req, env.JWT_ACCESS_SECRET);

    if (isImpersonationCookie) {
      enforceImpersonationCsrf(req);
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub, isActive: true },
      select: {
        id: true,
        email: true,
        role: true,
        organisationId: true,
        isPlatformAdmin: true,
        platformRole: true,
      },
    });

    if (!user) {
      throw ApiError.unauthorized('Account not found or has been deactivated');
    }

    const authReq = req as AuthenticatedRequest;
    authReq.user = user;
    authReq.impersonation = payload.impersonation;
    applyImpersonationEnforcement(authReq, payload.impersonation);

    // Fix 1: claim.expiresAt/scope/read-only above are self-reported by the
    // JWT; revoke and exit can't rewrite an already-issued token. Confirm the
    // session is still ACTIVE server-side via the Redis liveness marker
    // (set by enter(), cleared by exit()/revoke() — see
    // impersonationSession.service.ts). Same lifecycle-route exemption as
    // applyImpersonationEnforcement: enter/exit must always succeed even with
    // a stale impersonation cookie attached.
    if (payload.impersonation && !isImpersonationLifecycleRoute(req)) {
      await assertImpersonationSessionLive(payload.impersonation.requestId);
    }

    next();
  }
);
