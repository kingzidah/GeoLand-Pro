/**
 * GeoLand Pro — RBAC single source of truth.
 *
 * Roles, capabilities, and the role -> capability matrix used by apps/api,
 * apps/web, and apps/tenant-portal. Feature code checks capabilities via
 * `can`/`canAny`, never raw roles (except the few documented hard role-gates
 * in apps/api routers).
 *
 * Role/Capability are modelled as const objects + derived unions (not TS
 * `enum`) so they structurally match the Prisma `Role` enum without nominal
 * `enum` friction at the API boundary.
 */

export const Role = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  FIELD_SURVEYOR: 'FIELD_SURVEYOR',
  TENANT: 'TENANT',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

/**
 * Capabilities are the atoms of permission. Naming: MODULE_ACTION[_SCOPE].
 * OWN/VIEW-suffixed capabilities are enforced at the query layer (Phase 5).
 */
export const Capability = {
  // Dashboard
  DASHBOARD_VIEW_FULL: 'DASHBOARD_VIEW_FULL',
  DASHBOARD_VIEW_OWN: 'DASHBOARD_VIEW_OWN',

  // Properties & plots
  PROPERTY_EDIT: 'PROPERTY_EDIT',
  PROPERTY_CREATE_DELETE: 'PROPERTY_CREATE_DELETE',
  PLOT_VIEW: 'PLOT_VIEW',
  PLOT_VIEW_OWN: 'PLOT_VIEW_OWN',
  PLOT_CREATE_EDIT: 'PLOT_CREATE_EDIT',
  PLOT_STATUS_UPDATE: 'PLOT_STATUS_UPDATE',

  // Tenants
  TENANT_MANAGE: 'TENANT_MANAGE',
  TENANT_VIEW_OWN: 'TENANT_VIEW_OWN',

  // Leases
  LEASE_MANAGE: 'LEASE_MANAGE',
  LEASE_VIEW_OWN: 'LEASE_VIEW_OWN',
  LEASE_TERMINATE: 'LEASE_TERMINATE',

  // Payments / finance
  PAYMENT_MANAGE: 'PAYMENT_MANAGE',
  PAYMENT_VIEW_OWN: 'PAYMENT_VIEW_OWN',
  PAYMENT_STATUS_OVERRIDE: 'PAYMENT_STATUS_OVERRIDE',
  FINANCE_DASHBOARD_FULL: 'FINANCE_DASHBOARD_FULL',
  FINANCE_DASHBOARD_VIEW: 'FINANCE_DASHBOARD_VIEW',
  FINANCE_COMMISSION_SETTLE: 'FINANCE_COMMISSION_SETTLE',

  // Documents
  DOCUMENT_GENERATE_ALL: 'DOCUMENT_GENERATE_ALL',
  DOCUMENT_GENERATE_RECEIPTS: 'DOCUMENT_GENERATE_RECEIPTS', // receipts + demand letters
  DOCUMENT_VIEW_OWN: 'DOCUMENT_VIEW_OWN',

  // Map
  MAP_VIEW_FULL: 'MAP_VIEW_FULL',
  MAP_VIEW_OWN_PLOT: 'MAP_VIEW_OWN_PLOT',

  // Survey
  SURVEY_IMPORT: 'SURVEY_IMPORT',

  // Satellite
  SATELLITE_MANAGE: 'SATELLITE_MANAGE', // includes ordering captures
  SATELLITE_VIEW: 'SATELLITE_VIEW',

  // Vault
  VAULT_MANAGE: 'VAULT_MANAGE',

  // AI
  AI_ASSISTANT: 'AI_ASSISTANT',

  // Alerts
  ALERT_MANAGE: 'ALERT_MANAGE',
  ALERT_VIEW: 'ALERT_VIEW',

  // Org / platform administration
  TEAM_MANAGE: 'TEAM_MANAGE',
  ORG_SETTINGS: 'ORG_SETTINGS',
  ADMIN_PANEL_VIEW: 'ADMIN_PANEL_VIEW',
  SUPPORT_TICKETS: 'SUPPORT_TICKETS',

  // Tenant self-service
  PROFILE_EDIT_OWN: 'PROFILE_EDIT_OWN',
  COMPLAINT_SUBMIT: 'COMPLAINT_SUBMIT',
} as const;

export type Capability = (typeof Capability)[keyof typeof Capability];

/**
 * THE MATRIX. Each role lists the capabilities it holds. A capability absent
 * from a role's set is a hard deny at every layer.
 */
export const ROLE_CAPABILITIES: Record<Role, ReadonlySet<Capability>> = {
  [Role.SUPER_ADMIN]: new Set<Capability>([
    Capability.DASHBOARD_VIEW_FULL,
    Capability.PROPERTY_EDIT,
    Capability.PROPERTY_CREATE_DELETE,
    Capability.PLOT_VIEW,
    Capability.PLOT_CREATE_EDIT,
    Capability.PLOT_STATUS_UPDATE,
    Capability.TENANT_MANAGE,
    Capability.LEASE_MANAGE,
    Capability.LEASE_TERMINATE,
    Capability.PAYMENT_MANAGE,
    Capability.PAYMENT_STATUS_OVERRIDE,
    Capability.FINANCE_DASHBOARD_FULL,
    Capability.FINANCE_COMMISSION_SETTLE,
    Capability.DOCUMENT_GENERATE_ALL,
    Capability.MAP_VIEW_FULL,
    Capability.SURVEY_IMPORT,
    Capability.SATELLITE_MANAGE,
    Capability.VAULT_MANAGE,
    Capability.AI_ASSISTANT,
    Capability.ALERT_MANAGE,
    Capability.TEAM_MANAGE,
    Capability.ORG_SETTINGS,
    Capability.ADMIN_PANEL_VIEW,
    Capability.SUPPORT_TICKETS,
  ]),

  [Role.ADMIN]: new Set<Capability>([
    Capability.DASHBOARD_VIEW_FULL,
    Capability.PROPERTY_EDIT, // create/edit but NOT delete
    Capability.PLOT_VIEW,
    Capability.PLOT_CREATE_EDIT,
    Capability.PLOT_STATUS_UPDATE,
    Capability.TENANT_MANAGE,
    Capability.LEASE_MANAGE,
    Capability.LEASE_TERMINATE,
    Capability.PAYMENT_MANAGE,
    Capability.PAYMENT_STATUS_OVERRIDE,
    Capability.FINANCE_DASHBOARD_FULL,
    Capability.DOCUMENT_GENERATE_ALL,
    Capability.MAP_VIEW_FULL,
    Capability.SURVEY_IMPORT,
    Capability.SATELLITE_MANAGE,
    Capability.VAULT_MANAGE,
    Capability.AI_ASSISTANT,
    Capability.ALERT_MANAGE,
    Capability.ADMIN_PANEL_VIEW,
    Capability.SUPPORT_TICKETS,
    // NO PROPERTY_CREATE_DELETE, NO TEAM_MANAGE, NO ORG_SETTINGS, NO FINANCE_COMMISSION_SETTLE
  ]),

  [Role.MANAGER]: new Set<Capability>([
    Capability.DASHBOARD_VIEW_FULL, // scoped to assigned properties at query layer
    Capability.PLOT_VIEW,
    Capability.PLOT_CREATE_EDIT,
    Capability.PLOT_STATUS_UPDATE,
    Capability.TENANT_MANAGE,
    Capability.LEASE_MANAGE,
    Capability.PAYMENT_MANAGE,
    Capability.FINANCE_DASHBOARD_VIEW, // VIEW only
    Capability.DOCUMENT_GENERATE_RECEIPTS, // receipts + demand letters only
    Capability.MAP_VIEW_FULL,
    Capability.SURVEY_IMPORT,
    Capability.SATELLITE_VIEW, // view only, no ordering
    Capability.AI_ASSISTANT,
    Capability.ALERT_MANAGE,
    // NO property create/delete, NO lease termination, NO full finance/documents,
    // NO vault, NO team/settings/admin panel
  ]),

  [Role.FIELD_SURVEYOR]: new Set<Capability>([
    Capability.PLOT_VIEW, // view existing boundaries
    Capability.PLOT_CREATE_EDIT, // add/edit plots while surveying
    Capability.MAP_VIEW_FULL, // view the property map
    Capability.SURVEY_IMPORT, // primary job
    Capability.ALERT_VIEW, // view active alerts only
    // EVERYTHING ELSE DENIED: no dashboard, tenants, leases, finance,
    // documents, satellite, vault, AI, team, settings.
  ]),

  [Role.TENANT]: new Set<Capability>([
    Capability.DASHBOARD_VIEW_OWN,
    Capability.PLOT_VIEW_OWN,
    Capability.TENANT_VIEW_OWN,
    Capability.LEASE_VIEW_OWN,
    Capability.PAYMENT_VIEW_OWN,
    Capability.DOCUMENT_VIEW_OWN, // own receipts + tenancy agreement
    Capability.MAP_VIEW_OWN_PLOT,
    Capability.PROFILE_EDIT_OWN,
    Capability.COMPLAINT_SUBMIT,
  ]),
};

/** Core check used everywhere. Does NOT account for platform-admin bypass. */
export function can(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role]?.has(capability) ?? false;
}

/** True if the role holds ANY of the given capabilities. */
export function canAny(role: Role, capabilities: Capability[]): boolean {
  return capabilities.some((c) => can(role, c));
}

/** Layer-1 escape hatch. Platform admins bypass org scoping and the matrix entirely. */
export function isPlatformAdmin(user: { isPlatformAdmin?: boolean } | null | undefined): boolean {
  return user?.isPlatformAdmin === true;
}

/** Which application shell a role belongs in. */
export const AppShell = {
  MASTER_CONTROL: 'MASTER_CONTROL', // Layer 1 — platform admins
  ORG: 'ORG', // Layer 2 — Super Admin / Admin / Manager / Field Surveyor
  TENANT_PORTAL: 'TENANT_PORTAL', // Layer 3 — tenant
} as const;

export type AppShell = (typeof AppShell)[keyof typeof AppShell];

export function shellForRole(role: Role, platformAdmin = false): AppShell {
  if (platformAdmin) return AppShell.MASTER_CONTROL;
  if (role === Role.TENANT) return AppShell.TENANT_PORTAL;
  return AppShell.ORG;
}

/**
 * Minimum-rank gate, retained for transitional compatibility with
 * `ProtectedRoute`'s `minRole` prop while frontend gating migrates to
 * capability checks (Phase 4). New code should prefer `can`/`canAny`.
 */
export const ROLE_RANK: Record<Role, number> = {
  [Role.TENANT]: 10,
  [Role.FIELD_SURVEYOR]: 20,
  [Role.MANAGER]: 30,
  [Role.ADMIN]: 40,
  [Role.SUPER_ADMIN]: 50,
};

export function hasMinRole(role: Role | undefined, minRole: Role): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

/**
 * ─── MASTER CONTROL (Layer 1) ──────────────────────────────────────────────
 *
 * Platform-staff roles, distinct from the org-level `Role` matrix above.
 * These gate access to apps/master-control and /api/v1/platform/* — they are
 * orthogonal to `Role`/`Capability`, which govern the tenant-org shell.
 * `platformRole` is `null` for every non-platform-admin user.
 */
export const PlatformRole = {
  TECHNICAL_DIRECTOR: 'TECHNICAL_DIRECTOR',
  MANAGING_DIRECTOR: 'MANAGING_DIRECTOR',
  FINANCE_CONTROLLER: 'FINANCE_CONTROLLER',
  OPERATIONS_LEAD: 'OPERATIONS_LEAD',
  BOARD_OBSERVER: 'BOARD_OBSERVER',
} as const;

export type PlatformRole = (typeof PlatformRole)[keyof typeof PlatformRole];

/**
 * Capabilities for the seven Master Control modules. Naming: MODULE_ACTION[_SCOPE].
 */
export const PlatformCapability = {
  // Module 1 — Client Management
  ORG_VIEW: 'ORG_VIEW',
  ORG_CREATE: 'ORG_CREATE', // create a new organisation (kicks off onboarding)
  ORG_MANAGE: 'ORG_MANAGE', // edit commission/tier, suspend, reinstate existing orgs
  ORG_DELETE: 'ORG_DELETE', // two-founder confirmation token flow
  ORG_IMPERSONATE: 'ORG_IMPERSONATE',

  // Module 2 — Revenue & Commission
  REVENUE_VIEW: 'REVENUE_VIEW',
  REVENUE_MANAGE: 'REVENUE_MANAGE',

  // Module 3 — Platform Health
  HEALTH_VIEW_SUMMARY: 'HEALTH_VIEW_SUMMARY',
  HEALTH_VIEW_DETAIL: 'HEALTH_VIEW_DETAIL', // raw logs, DB console, deploy triggers

  // Module 4 — Onboarding Pipeline
  ONBOARDING_VIEW: 'ONBOARDING_VIEW',
  ONBOARDING_MANAGE: 'ONBOARDING_MANAGE',

  // Module 5 — Audit & Security
  AUDIT_VIEW: 'AUDIT_VIEW',
  AUDIT_EXPORT: 'AUDIT_EXPORT',

  // Module 6 — Support Centre
  SUPPORT_VIEW: 'SUPPORT_VIEW',
  SUPPORT_MANAGE: 'SUPPORT_MANAGE',

  // Module 7 — Platform Settings
  SETTINGS_VIEW: 'SETTINGS_VIEW',
  SETTINGS_MANAGE: 'SETTINGS_MANAGE', // default commission rate, maintenance mode, brand/templates
} as const;

export type PlatformCapability = (typeof PlatformCapability)[keyof typeof PlatformCapability];

/**
 * THE PLATFORM MATRIX. Each platform role lists the capabilities it holds. A
 * capability absent from a role's set is a hard deny at every layer (404 for
 * non-platform users at the route gate, 403 for platform users lacking the
 * specific capability).
 */
export const PLATFORM_CAPABILITIES: Record<PlatformRole, ReadonlySet<PlatformCapability>> = {
  [PlatformRole.TECHNICAL_DIRECTOR]: new Set<PlatformCapability>(Object.values(PlatformCapability)),

  [PlatformRole.MANAGING_DIRECTOR]: new Set<PlatformCapability>([
    PlatformCapability.ORG_VIEW,
    PlatformCapability.ORG_CREATE,
    PlatformCapability.ORG_MANAGE,
    PlatformCapability.ORG_DELETE,
    PlatformCapability.ORG_IMPERSONATE,
    PlatformCapability.REVENUE_VIEW,
    PlatformCapability.REVENUE_MANAGE,
    PlatformCapability.HEALTH_VIEW_SUMMARY,
    PlatformCapability.ONBOARDING_VIEW,
    PlatformCapability.ONBOARDING_MANAGE,
    PlatformCapability.AUDIT_VIEW,
    PlatformCapability.SUPPORT_VIEW,
    PlatformCapability.SUPPORT_MANAGE,
    PlatformCapability.SETTINGS_VIEW,
    // NO HEALTH_VIEW_DETAIL (raw logs/DB console/deploy), NO AUDIT_EXPORT (TD only),
    // NO SETTINGS_MANAGE (brand/maintenance)
  ]),

  [PlatformRole.FINANCE_CONTROLLER]: new Set<PlatformCapability>([
    PlatformCapability.ORG_VIEW, // client list, read-only — who owes, at what tier
    PlatformCapability.REVENUE_VIEW,
    PlatformCapability.REVENUE_MANAGE, // invoicing, mark-paid, forecast, export
    // NO org create/manage/delete/impersonate, NO health, NO onboarding, NO audit,
    // NO support, NO settings
  ]),

  [PlatformRole.OPERATIONS_LEAD]: new Set<PlatformCapability>([
    PlatformCapability.ORG_VIEW,
    PlatformCapability.ORG_CREATE, // create organisation (kicks off onboarding)
    PlatformCapability.ORG_IMPERSONATE, // impersonate-for-support
    PlatformCapability.ONBOARDING_VIEW,
    PlatformCapability.ONBOARDING_MANAGE,
    PlatformCapability.SUPPORT_VIEW,
    PlatformCapability.SUPPORT_MANAGE,
    // NO ORG_MANAGE (edit commission/tier, suspend, reinstate), NO ORG_DELETE,
    // NO revenue, NO health, NO audit, NO settings
  ]),

  [PlatformRole.BOARD_OBSERVER]: new Set<PlatformCapability>([
    PlatformCapability.ORG_VIEW, // client counts/status only
    PlatformCapability.REVENUE_VIEW, // revenue summary / headline KPIs
    // Read-only, two modules only — no create/manage/delete/impersonate/export/detail,
    // no health, onboarding, audit, support, or settings
  ]),
};

/** Platform-level capability check. `null`/`undefined` (non-platform users) are always denied. */
export function canPlatform(
  platformRole: PlatformRole | null | undefined,
  capability: PlatformCapability
): boolean {
  if (!platformRole) return false;
  return PLATFORM_CAPABILITIES[platformRole]?.has(capability) ?? false;
}

/** True if the platform role holds ANY of the given capabilities. */
export function canAnyPlatform(
  platformRole: PlatformRole | null | undefined,
  capabilities: PlatformCapability[]
): boolean {
  return capabilities.some((c) => canPlatform(platformRole, c));
}

/**
 * ─── CONSENT-GATED IMPERSONATION ────────────────────────────────────────────
 *
 * Per-section scopes a client SUPER_ADMIN can grant to platform staff during a
 * scoped, read-only, time-boxed impersonation session (`OrgAccessRequest`).
 * Single source of truth for apps/master-control (request UI), apps/web
 * (approval UI, nav/route gating), and apps/api (enforcement middleware).
 */
export const AccessScope = {
  PLOTS: 'PLOTS',
  SATELLITE: 'SATELLITE',
  LEASES: 'LEASES',
  TENANTS: 'TENANTS',
  FINANCE: 'FINANCE',
  DOCUMENTS: 'DOCUMENTS',
} as const;

export type AccessScope = (typeof AccessScope)[keyof typeof AccessScope];

/** All grantable scopes, in display order. */
export const ALL_ACCESS_SCOPES: readonly AccessScope[] = Object.values(AccessScope);

/**
 * Scopes pre-selected ON in the approval UI. SATELLITE (surveillance-grade
 * overhead imagery) is more sensitive than plot records and defaults OFF.
 */
export const DEFAULT_GRANTED_ACCESS_SCOPES: readonly AccessScope[] = [
  AccessScope.PLOTS,
  AccessScope.LEASES,
  AccessScope.TENANTS,
  AccessScope.FINANCE,
  AccessScope.DOCUMENTS,
];

/**
 * Maps each AccessScope to the org-facing API route prefixes (mounted under
 * /api/v1) it unlocks during an impersonation session. Photos fold into PLOTS
 * (client's own field documentation). FINANCE covers summaries/dashboard only.
 *
 * Any route prefix NOT listed here — including /transactions (individual
 * payment rows), /admin, /vault, /ai, /alerts, /notifications, /org — is
 * hard-blocked for impersonation sessions regardless of grantedScopes. The
 * enforcement middleware (apps/api) must treat this map as an allow-list.
 */
export const ACCESS_SCOPE_ROUTES: Record<AccessScope, readonly string[]> = {
  [AccessScope.PLOTS]: ['/properties', '/plots', '/photos'],
  [AccessScope.SATELLITE]: ['/satellite'],
  [AccessScope.LEASES]: ['/leases'],
  [AccessScope.TENANTS]: ['/tenants'],
  [AccessScope.FINANCE]: ['/finance'],
  [AccessScope.DOCUMENTS]: ['/documents'],
};
