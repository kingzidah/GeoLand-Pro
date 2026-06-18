import { Request, Response, NextFunction } from 'express';
import { canPlatform, type PlatformCapability } from '@geolandpro/rbac';
import { AuthenticatedRequest } from './authenticate';

// ─── Multi-tenancy data isolation ─────────────────────────────────────────────
// Platform admins (GeoLand Pro team) bypass organisation scoping entirely and
// can see data across every organisation. Everyone else is pinned to the
// organisation they belong to — req.organisationId is then used by every
// service to filter queries with `WHERE organisationId = req.organisationId`.
export const scopeToOrganisation = (req: Request, res: Response, next: NextFunction): void => {
  const authReq = req as AuthenticatedRequest;

  // An active impersonation session has already pinned req.organisationId
  // (and cleared isPlatformAdmin) in authenticate.ts — respect it rather
  // than falling through to the staff member's own (org-less) account.
  if (authReq.organisationId) {
    next();
    return;
  }

  if (authReq.user.isPlatformAdmin) {
    next();
    return;
  }

  if (!authReq.user.organisationId) {
    res.status(403).json({ error: 'No organisation access' });
    return;
  }

  authReq.organisationId = authReq.user.organisationId;
  next();
};

// ─── Platform admin gate ───────────────────────────────────────────────────────
// For routes under /platform/* — only the GeoLand Pro team (isPlatformAdmin)
// may access these, regardless of their role within any organisation.
// Returns 404 (not 403) for non-platform-admins so /platform is invisible
// rather than merely forbidden.
export const requirePlatformAdmin = (req: Request, res: Response, next: NextFunction): void => {
  const authReq = req as AuthenticatedRequest;

  if (!authReq.user.isPlatformAdmin) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  next();
};

// ─── Platform capability gate ──────────────────────────────────────────────────
// For routes under /platform/* — non-platform-admins get 404 (route invisible),
// platform staff lacking the specific PlatformCapability get 403.
export const requirePlatformCapability =
  (capability: PlatformCapability) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;

    if (!authReq.user.isPlatformAdmin) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    if (!canPlatform(authReq.user.platformRole, capability)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    next();
  };

// ─── Platform IP allow-list (disabled) ─────────────────────────────────────────
// Hook point for restricting Master Control access by source IP. Currently a
// passthrough — every request is allowed regardless of req.ip. Wiring this up
// is part of a future security sprint; until then this is a documented no-op so
// the enforcement point exists in the request pipeline ahead of time.
// TODO SPRINT-SECURITY: enable IP allow-list — compare req.ip against a
// configured allow-list and return 403 for non-matching addresses.
export const platformIpAllowList = (_req: Request, _res: Response, next: NextFunction): void => {
  next();
};

// ─── Org-scoped admin gate ─────────────────────────────────────────────────────
// For routes under /org/* — the requester must belong to an organisation
// (platform admins have no organisation of their own to administer here).
export const requireOrganisation = (req: Request, res: Response, next: NextFunction): void => {
  const authReq = req as AuthenticatedRequest;

  if (!authReq.organisationId) {
    res.status(400).json({ error: 'This action requires an organisation context' });
    return;
  }

  next();
};
