import { Request, Response } from 'express';
import { accessRequestService } from '../services/accessRequest.service';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthenticatedRequest } from '../middleware/authenticate';
import { IMPERSONATION_COOKIE_NAME, impersonationCookieOptions } from '../middleware/impersonation';
import { env } from '../config/env';
import type {
  CreateAccessRequestInput,
  ApproveAccessRequestInput,
  ListAccessRequestsQuery,
} from '../validations/accessRequest.schema';

export const accessRequestController = {
  // ─── PLATFORM STAFF ───────────────────────────────────────────────────────────

  createRequest: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const request = await accessRequestService.createRequest(
      req.params.id,
      user.id,
      req.body as CreateAccessRequestInput
    );
    res.status(201).json({ success: true, data: request });
  }),

  listMine: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const result = await accessRequestService.listMine(user.id, req.query as unknown as ListAccessRequestsQuery);
    res.status(200).json({ success: true, ...result });
  }),

  // Mints the impersonation JWT and sets it as an httpOnly cookie — never
  // returned in the response body, never readable from JS. The cookie's
  // maxAge tracks the JWT's own TTL (see accessRequestService.enter).
  enter: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const result = await accessRequestService.enter(req.params.id, {
      id: user.id,
      email: user.email,
      role: user.role,
    });

    res.cookie(
      IMPERSONATION_COOKIE_NAME,
      result.accessToken,
      impersonationCookieOptions(env.NODE_ENV === 'production', result.expiresIn * 1000)
    );

    res.status(200).json({
      success: true,
      data: {
        organisation: result.organisation,
        grantedScopes: result.grantedScopes,
        expiresAt: result.expiresAt,
        readOnly: true,
      },
    });
  }),

  // Clears the impersonation cookie regardless of outcome below it — the
  // request then falls back to the primary Bearer session with zero
  // impersonation enforcement (resolveAccessToken, ./middleware/impersonation).
  exit: asyncHandler(async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    await accessRequestService.exit(req.params.id, user.id);
    res.clearCookie(IMPERSONATION_COOKIE_NAME, impersonationCookieOptions(env.NODE_ENV === 'production'));
    res.status(200).json({ success: true, message: 'Impersonation session ended' });
  }),

  // ─── ORG SUPER_ADMIN ────────────────────────────────────────────────────────────

  listForOrg: asyncHandler(async (req: Request, res: Response) => {
    const { organisationId } = req as AuthenticatedRequest;
    const result = await accessRequestService.listForOrg(
      organisationId as string,
      req.query as unknown as ListAccessRequestsQuery
    );
    res.status(200).json({ success: true, ...result });
  }),

  approve: asyncHandler(async (req: Request, res: Response) => {
    const { user, organisationId } = req as AuthenticatedRequest;
    const request = await accessRequestService.approve(
      req.params.id,
      organisationId as string,
      user.id,
      req.body as ApproveAccessRequestInput
    );
    res.status(200).json({ success: true, data: request });
  }),

  deny: asyncHandler(async (req: Request, res: Response) => {
    const { user, organisationId } = req as AuthenticatedRequest;
    const request = await accessRequestService.deny(req.params.id, organisationId as string, user.id);
    res.status(200).json({ success: true, data: request });
  }),

  revoke: asyncHandler(async (req: Request, res: Response) => {
    const { user, organisationId } = req as AuthenticatedRequest;
    const request = await accessRequestService.revoke(req.params.id, organisationId as string, user.id);
    res.status(200).json({ success: true, data: request });
  }),
};
