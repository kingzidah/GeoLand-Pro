import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { Capability, Role as RbacRole, can, canAny, isPlatformAdmin } from '@geolandpro/rbac';
import { ApiError } from '../utils/ApiError';
import { AuthenticatedRequest } from './authenticate';

/**
 * Capability-based RBAC middleware. Checks the requesting user's role against
 * the shared @geolandpro/rbac matrix. Platform admins (isPlatformAdmin === true)
 * bypass the matrix entirely (Layer-1 escape hatch).
 */
export const requireCapability =
  (capability: Capability) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const user = (req as AuthenticatedRequest).user;

    if (!user) {
      next(ApiError.unauthorized());
      return;
    }

    if (isPlatformAdmin(user)) {
      next();
      return;
    }

    if (!can(user.role as unknown as RbacRole, capability)) {
      next(ApiError.forbidden());
      return;
    }

    next();
  };

/** Allows the request if the user holds ANY of the listed capabilities. */
export const requireAnyCapability =
  (...capabilities: Capability[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const user = (req as AuthenticatedRequest).user;

    if (!user) {
      next(ApiError.unauthorized());
      return;
    }

    if (isPlatformAdmin(user)) {
      next();
      return;
    }

    if (!canAny(user.role as unknown as RbacRole, capabilities)) {
      next(ApiError.forbidden());
      return;
    }

    next();
  };

/**
 * Hard role gate — bypasses the capability matrix entirely. Reserve for the
 * rare endpoint that is intentionally role-specific rather than
 * capability-driven (e.g. SUPER_ADMIN-only property deletion).
 */
export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const user = (req as AuthenticatedRequest).user;

    if (!user) {
      next(ApiError.unauthorized());
      return;
    }

    if (isPlatformAdmin(user)) {
      next();
      return;
    }

    if (!roles.includes(user.role)) {
      next(ApiError.forbidden());
      return;
    }

    next();
  };
