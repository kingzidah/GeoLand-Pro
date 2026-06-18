import { Router } from 'express';
import { Role } from '@prisma/client';
import { PlatformCapability } from '@geolandpro/rbac';
import { organisationController } from '../controllers/organisation.controller';
import { accessRequestController } from '../controllers/accessRequest.controller';
import { platformRevenueController } from '../controllers/platformRevenue.controller';
import { platformAuditController } from '../controllers/platformAudit.controller';
import { platformSettingsController } from '../controllers/platformSettings.controller';
import { platformHealthController } from '../controllers/platformHealth.controller';
import { platformSupportController } from '../controllers/platformSupport.controller';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireCapability';
import {
  scopeToOrganisation,
  requirePlatformAdmin,
  requirePlatformCapability,
  requireOrganisation,
  platformIpAllowList,
} from '../middleware/tenant.middleware';
import { validate } from '../middleware/validate';
import { adminRateLimiter, documentRateLimiter } from '../middleware/rateLimit';
import {
  organisationIdParamSchema,
  orgUserIdParamSchema,
  listOrganisationsQuerySchema,
  createOrganisationSchema,
  updateOrganisationSchema,
  deleteOrganisationSchema,
  updateOrgSettingsSchema,
  listOrgUsersQuerySchema,
  changeOrgUserRoleSchema,
  createInviteSchema,
  listInviteCodesQuerySchema,
  listPlatformAuditLogsQuerySchema,
  updatePlatformSettingsSchema,
  updateOnboardingStageSchema,
  listSupportTicketsQuerySchema,
  supportTicketIdParamSchema,
  replySupportTicketSchema,
} from '../validations/organisation.schema';
import {
  accessRequestIdParamSchema,
  createAccessRequestSchema,
  listAccessRequestsQuerySchema,
  approveAccessRequestSchema,
} from '../validations/accessRequest.schema';

// ─── /api/v1/platform/* — GeoLand Pro platform team only ──────────────────────

export const platformRouter = Router();

platformRouter.use(authenticate);
platformRouter.use(adminRateLimiter);
platformRouter.use(platformIpAllowList);
platformRouter.use(requirePlatformAdmin);

platformRouter.get('/stats', requirePlatformCapability(PlatformCapability.ORG_VIEW), organisationController.getPlatformStats);

platformRouter.get(
  '/organisations',
  requirePlatformCapability(PlatformCapability.ORG_VIEW),
  validate({ query: listOrganisationsQuerySchema }),
  organisationController.listOrganisations
);

platformRouter.post(
  '/organisations',
  requirePlatformCapability(PlatformCapability.ORG_CREATE),
  validate({ body: createOrganisationSchema }),
  organisationController.createOrganisation
);

platformRouter.get(
  '/organisations/:id',
  requirePlatformCapability(PlatformCapability.ORG_VIEW),
  validate({ params: organisationIdParamSchema }),
  organisationController.getOrganisation
);

platformRouter.patch(
  '/organisations/:id',
  requirePlatformCapability(PlatformCapability.ORG_MANAGE),
  validate({ params: organisationIdParamSchema, body: updateOrganisationSchema }),
  organisationController.updateOrganisation
);

platformRouter.delete(
  '/organisations/:id',
  requirePlatformCapability(PlatformCapability.ORG_DELETE),
  validate({ params: organisationIdParamSchema, body: deleteOrganisationSchema }),
  organisationController.deleteOrganisation
);

platformRouter.delete(
  '/organisations/:id/suspend',
  requirePlatformCapability(PlatformCapability.ORG_MANAGE),
  validate({ params: organisationIdParamSchema }),
  organisationController.suspendOrganisation
);

platformRouter.patch(
  '/organisations/:id/activate',
  requirePlatformCapability(PlatformCapability.ORG_MANAGE),
  validate({ params: organisationIdParamSchema }),
  organisationController.activateOrganisation
);

platformRouter.post(
  '/organisations/:id/impersonate',
  requirePlatformCapability(PlatformCapability.ORG_IMPERSONATE),
  validate({ params: organisationIdParamSchema }),
  organisationController.impersonateOrganisation
);

// ─── Consent-gated scoped access requests ──────────────────────────────────────

platformRouter.post(
  '/organisations/:id/access-requests',
  requirePlatformCapability(PlatformCapability.ORG_IMPERSONATE),
  validate({ params: organisationIdParamSchema, body: createAccessRequestSchema }),
  accessRequestController.createRequest
);

platformRouter.get(
  '/access-requests/mine',
  requirePlatformCapability(PlatformCapability.ORG_IMPERSONATE),
  validate({ query: listAccessRequestsQuerySchema }),
  accessRequestController.listMine
);

platformRouter.post(
  '/access-requests/:id/enter',
  requirePlatformCapability(PlatformCapability.ORG_IMPERSONATE),
  validate({ params: accessRequestIdParamSchema }),
  accessRequestController.enter
);

platformRouter.post(
  '/access-requests/:id/exit',
  requirePlatformCapability(PlatformCapability.ORG_IMPERSONATE),
  validate({ params: accessRequestIdParamSchema }),
  accessRequestController.exit
);

platformRouter.get(
  '/revenue/summary',
  requirePlatformCapability(PlatformCapability.REVENUE_VIEW),
  platformRevenueController.getSummary
);

platformRouter.get(
  '/revenue/organisations',
  requirePlatformCapability(PlatformCapability.REVENUE_VIEW),
  validate({ query: listOrganisationsQuerySchema }),
  platformRevenueController.listOrganisationRevenue
);

platformRouter.get(
  '/audit-logs',
  requirePlatformCapability(PlatformCapability.AUDIT_VIEW),
  validate({ query: listPlatformAuditLogsQuerySchema }),
  platformAuditController.listAuditLogs
);

platformRouter.get(
  '/audit-logs/export',
  requirePlatformCapability(PlatformCapability.AUDIT_EXPORT),
  documentRateLimiter,
  validate({ query: listPlatformAuditLogsQuerySchema }),
  platformAuditController.exportAuditLogsPdf
);

platformRouter.get(
  '/settings',
  requirePlatformCapability(PlatformCapability.SETTINGS_VIEW),
  platformSettingsController.getSettings
);

platformRouter.patch(
  '/settings',
  requirePlatformCapability(PlatformCapability.SETTINGS_MANAGE),
  validate({ body: updatePlatformSettingsSchema }),
  platformSettingsController.updateSettings
);

platformRouter.get(
  '/health',
  requirePlatformCapability(PlatformCapability.HEALTH_VIEW_SUMMARY),
  platformHealthController.getSummary
);

platformRouter.get(
  '/onboarding',
  requirePlatformCapability(PlatformCapability.ONBOARDING_VIEW),
  organisationController.listOnboardingOrganisations
);

platformRouter.patch(
  '/organisations/:id/onboarding-stage',
  requirePlatformCapability(PlatformCapability.ONBOARDING_MANAGE),
  validate({ params: organisationIdParamSchema, body: updateOnboardingStageSchema }),
  organisationController.updateOnboardingStage
);

platformRouter.get(
  '/support/tickets',
  requirePlatformCapability(PlatformCapability.SUPPORT_VIEW),
  validate({ query: listSupportTicketsQuerySchema }),
  platformSupportController.listTickets
);

platformRouter.get(
  '/support/tickets/:id',
  requirePlatformCapability(PlatformCapability.SUPPORT_VIEW),
  validate({ params: supportTicketIdParamSchema }),
  platformSupportController.getTicket
);

platformRouter.post(
  '/support/tickets/:id/reply',
  requirePlatformCapability(PlatformCapability.SUPPORT_MANAGE),
  validate({ params: supportTicketIdParamSchema, body: replySupportTicketSchema }),
  platformSupportController.replyToTicket
);

platformRouter.post(
  '/support/tickets/:id/escalate',
  requirePlatformCapability(PlatformCapability.SUPPORT_MANAGE),
  validate({ params: supportTicketIdParamSchema }),
  platformSupportController.escalateTicket
);

platformRouter.post(
  '/support/tickets/:id/close',
  requirePlatformCapability(PlatformCapability.SUPPORT_MANAGE),
  validate({ params: supportTicketIdParamSchema }),
  platformSupportController.closeTicket
);

// ─── /api/v1/org/* — SUPER_ADMIN within their own organisation ─────────────────

export const orgRouter = Router();

orgRouter.use(authenticate);
orgRouter.use(scopeToOrganisation);
orgRouter.use(requireOrganisation);
orgRouter.use(requireRole(Role.SUPER_ADMIN));

orgRouter
  .route('/settings')
  .get(organisationController.getOrgSettings)
  .patch(validate({ body: updateOrgSettingsSchema }), organisationController.updateOrgSettings);

orgRouter.get(
  '/users',
  validate({ query: listOrgUsersQuerySchema }),
  organisationController.listOrgUsers
);

orgRouter.delete(
  '/users/:userId',
  validate({ params: orgUserIdParamSchema }),
  organisationController.removeOrgUser
);

orgRouter.patch(
  '/users/:userId/role',
  validate({ params: orgUserIdParamSchema, body: changeOrgUserRoleSchema }),
  organisationController.changeOrgUserRole
);

orgRouter.post(
  '/invite',
  validate({ body: createInviteSchema }),
  organisationController.createInvite
);

orgRouter.get(
  '/invite-codes',
  validate({ query: listInviteCodesQuerySchema }),
  organisationController.listInviteCodes
);

// ─── Consent-gated scoped access requests ──────────────────────────────────────

orgRouter.get(
  '/access-requests',
  validate({ query: listAccessRequestsQuerySchema }),
  accessRequestController.listForOrg
);

orgRouter.patch(
  '/access-requests/:id/approve',
  validate({ params: accessRequestIdParamSchema, body: approveAccessRequestSchema }),
  accessRequestController.approve
);

orgRouter.patch(
  '/access-requests/:id/deny',
  validate({ params: accessRequestIdParamSchema }),
  accessRequestController.deny
);

orgRouter.patch(
  '/access-requests/:id/revoke',
  validate({ params: accessRequestIdParamSchema }),
  accessRequestController.revoke
);
