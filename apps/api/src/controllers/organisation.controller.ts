import { Request, Response } from 'express';
import { organisationService } from '../services/organisation.service';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthenticatedRequest } from '../middleware/authenticate';
import { ApiError } from '../utils/ApiError';
import type {
  ListOrganisationsQuery,
  CreateOrganisationInput,
  UpdateOrganisationInput,
  DeleteOrganisationInput,
  UpdateOrgSettingsInput,
  ListOrgUsersQuery,
  ChangeOrgUserRoleInput,
  CreateInviteInput,
  ListInviteCodesQuery,
  UpdateOnboardingStageInput,
} from '../validations/organisation.schema';

export const organisationController = {
  // ─── PLATFORM ADMIN ───────────────────────────────────────────────────────────

  listOrganisations: asyncHandler(async (req: Request, res: Response) => {
    const result = await organisationService.listOrganisations(req.query as unknown as ListOrganisationsQuery);
    res.status(200).json({ success: true, ...result });
  }),

  getOrganisation: asyncHandler(async (req: Request, res: Response) => {
    const organisation = await organisationService.getOrganisationById(req.params.id);
    res.status(200).json({ success: true, data: organisation });
  }),

  createOrganisation: asyncHandler(async (req: Request, res: Response) => {
    const { id: requesterId } = (req as AuthenticatedRequest).user;
    const result = await organisationService.createOrganisation(req.body as CreateOrganisationInput, requesterId);
    res.status(201).json({ success: true, data: result });
  }),

  updateOrganisation: asyncHandler(async (req: Request, res: Response) => {
    const { id: requesterId } = (req as AuthenticatedRequest).user;
    const organisation = await organisationService.updateOrganisation(
      req.params.id,
      req.body as UpdateOrganisationInput,
      requesterId
    );
    res.status(200).json({ success: true, data: organisation });
  }),

  deleteOrganisation: asyncHandler(async (req: Request, res: Response) => {
    const { id: requesterId } = (req as AuthenticatedRequest).user;
    const { confirmationToken } = req.body as DeleteOrganisationInput;
    const result = await organisationService.requestOrCompleteDeletion(req.params.id, requesterId, confirmationToken);
    const status = result.status === 'confirmation_required' ? 202 : 200;
    res.status(status).json({ success: true, ...result });
  }),

  suspendOrganisation: asyncHandler(async (req: Request, res: Response) => {
    const { id: requesterId } = (req as AuthenticatedRequest).user;
    const organisation = await organisationService.setOrganisationActive(req.params.id, false, requesterId);
    res.status(200).json({ success: true, data: organisation });
  }),

  activateOrganisation: asyncHandler(async (req: Request, res: Response) => {
    const { id: requesterId } = (req as AuthenticatedRequest).user;
    const organisation = await organisationService.setOrganisationActive(req.params.id, true, requesterId);
    res.status(200).json({ success: true, data: organisation });
  }),

  impersonateOrganisation: asyncHandler(async (_req: Request, _res: Response) => {
    throw new ApiError(
      410,
      'Direct impersonation is disabled; use the access-request flow',
      true,
      { code: 'IMPERSONATION_DISABLED' }
    );
  }),

  getPlatformStats: asyncHandler(async (_req: Request, res: Response) => {
    const stats = await organisationService.getPlatformStats();
    res.status(200).json({ success: true, data: stats });
  }),

  listOnboardingOrganisations: asyncHandler(async (_req: Request, res: Response) => {
    const data = await organisationService.listOnboardingOrganisations();
    res.status(200).json({ success: true, data });
  }),

  updateOnboardingStage: asyncHandler(async (req: Request, res: Response) => {
    const { id: requesterId } = (req as AuthenticatedRequest).user;
    const { stage } = req.body as UpdateOnboardingStageInput;
    const organisation = await organisationService.updateOnboardingStage(req.params.id, stage, requesterId);
    res.status(200).json({ success: true, data: organisation });
  }),

  // ─── ORG ADMIN ────────────────────────────────────────────────────────────────

  getOrgSettings: asyncHandler(async (req: Request, res: Response) => {
    const organisationId = (req as AuthenticatedRequest).organisationId as string;
    const organisation = await organisationService.getOrgSettings(organisationId);
    res.status(200).json({ success: true, data: organisation });
  }),

  updateOrgSettings: asyncHandler(async (req: Request, res: Response) => {
    const organisationId = (req as AuthenticatedRequest).organisationId as string;
    const organisation = await organisationService.updateOrgSettings(
      organisationId,
      req.body as UpdateOrgSettingsInput
    );
    res.status(200).json({ success: true, data: organisation });
  }),

  listOrgUsers: asyncHandler(async (req: Request, res: Response) => {
    const organisationId = (req as AuthenticatedRequest).organisationId as string;
    const result = await organisationService.listOrgUsers(
      organisationId,
      req.query as unknown as ListOrgUsersQuery
    );
    res.status(200).json({ success: true, ...result });
  }),

  removeOrgUser: asyncHandler(async (req: Request, res: Response) => {
    const { id: requesterId } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId as string;
    await organisationService.removeOrgUser(organisationId, requesterId, req.params.userId);
    res.status(200).json({ success: true, message: 'User removed from organisation' });
  }),

  changeOrgUserRole: asyncHandler(async (req: Request, res: Response) => {
    const { id: requesterId } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId as string;
    const user = await organisationService.changeOrgUserRole(
      organisationId,
      requesterId,
      req.params.userId,
      req.body as ChangeOrgUserRoleInput
    );
    res.status(200).json({ success: true, data: user });
  }),

  createInvite: asyncHandler(async (req: Request, res: Response) => {
    const { id: requesterId } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId as string;
    const invite = await organisationService.createInvite(
      organisationId,
      requesterId,
      req.body as CreateInviteInput
    );
    res.status(201).json({ success: true, data: invite });
  }),

  listInviteCodes: asyncHandler(async (req: Request, res: Response) => {
    const organisationId = (req as AuthenticatedRequest).organisationId as string;
    const result = await organisationService.listInviteCodes(
      organisationId,
      req.query as unknown as ListInviteCodesQuery
    );
    res.status(200).json({ success: true, ...result });
  }),
};
