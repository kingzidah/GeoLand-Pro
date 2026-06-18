import type { AccessScope } from '@geolandpro/rbac';

// ─── Enums (mirror Prisma enums) ──────────────────────────────────────────────

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'FIELD_SURVEYOR' | 'TENANT';

// Master Control (Layer 1) roles — gate access to this app.
export type PlatformRole =
  | 'TECHNICAL_DIRECTOR'
  | 'MANAGING_DIRECTOR'
  | 'FINANCE_CONTROLLER'
  | 'OPERATIONS_LEAD'
  | 'BOARD_OBSERVER';

// ─── Models ───────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  role: Role;
  phone: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  isEmailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  organisationId: string | null;
  isPlatformAdmin: boolean;
  platformRole: PlatformRole | null;
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export interface ApiListResponse<T> extends PaginatedResponse<T> {
  success: boolean;
}

// ─── Organisations (Client Management) ─────────────────────────────────────────

export interface Organisation {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  country: string;
  currency: string;
  timezone: string;
  isActive: boolean;
  subscriptionTier: string;
  commissionRate: number;
  maxProperties: number;
  maxUsers: number;
  onboardingStage: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrganisationWithStats extends Organisation {
  userCount: number;
  propertyCount: number;
  lastActiveAt: string | null;
}

export interface OrganisationDetail extends Organisation {
  userCount: number;
  propertyCount: number;
  revenueThisMonthGHS: number;
  totalCommissionEarnedGHS: number;
}

export interface PlatformStats {
  totalOrganisations: number;
  activeOrganisations: number;
  totalUsers: number;
  totalProperties: number;
  totalRevenueThisMonthGHS: number;
  totalCommissionEarnedGHS: number;
}

// ─── Revenue & Commission ───────────────────────────────────────────────────

export interface RevenueSummary {
  revenueThisMonthGHS: number;
  commissionThisMonthGHS: number;
  totalCommissionEarnedGHS: number;
  commissionPaidGHS: number;
  commissionOutstandingGHS: number;
}

export interface OrganisationRevenue {
  id: string;
  name: string;
  slug: string;
  subscriptionTier: string;
  commissionRate: number;
  isActive: boolean;
  revenueThisMonthGHS: number;
  totalCommissionEarnedGHS: number;
  commissionPaidGHS: number;
  commissionOutstandingGHS: number;
}

// ─── Audit & Security ───────────────────────────────────────────────────────

// ─── Onboarding Pipeline ─────────────────────────────────────────────────────

export interface OnboardingOrganisation {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  onboardingStage: number;
  createdAt: string;
  userCount: number;
}

// ─── Platform Health ──────────────────────────────────────────────────────────

export interface JobHealthStatus {
  name: string;
  schedule: string;
  description: string;
  queueName: string;
  status: string;
}

export interface PlatformHealth {
  api: { status: string; uptimeSeconds: number; timestamp: string };
  database: { status: string };
  redis: { status: string };
  jobs: JobHealthStatus[];
}

// ─── Platform Settings ───────────────────────────────────────────────────────

export interface PlatformSettings {
  defaultCommissionRate: number;
  maintenanceMode: boolean;
  updatedAt: string | null;
}

// ─── Support Centre ───────────────────────────────────────────────────────────

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface SupportTicket {
  id: string;
  organisationId: string;
  subject: string;
  body: string;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  organisation: { id: string; name: string; slug: string };
}

export interface SupportTicketActivity {
  id: string;
  action: string;
  metadata: unknown;
  createdAt: string;
  user: { firstName: string; lastName: string; email: string };
}

export interface SupportTicketDetail extends SupportTicket {
  activity: SupportTicketActivity[];
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: Role;
    organisationId: string | null;
    organisation: { id: string; name: string } | null;
  };
}

// ─── Access Requests (Master-Control Impersonation Integration) ─────────────
// Consent-gated scoped impersonation (OrgAccessRequest, apps/api). Master
// Control creates and lists these; the landowner's Accept and the staff
// "Enter" (which sets the apps/web impersonation cookie) happen in apps/web.

export type AccessRequestStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'DENIED'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'REVOKED'
  | 'ENDED';

export interface OrgAccessRequest {
  id: string;
  organisationId: string;
  requestedById: string;
  reason: string | null;
  requestedScopes: AccessScope[];
  grantedScopes: AccessScope[];
  status: AccessRequestStatus;
  approvedById: string | null;
  expiresAt: string | null;
  createdAt: string;
  approvedAt: string | null;
  endedAt: string | null;
  organisation?: { id: string; name: string; slug: string };
}
