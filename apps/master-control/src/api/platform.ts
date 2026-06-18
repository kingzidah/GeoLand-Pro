import { api } from './client';
import type {
  AccessRequestStatus,
  ApiResponse,
  ApiListResponse,
  AuditLogEntry,
  OnboardingOrganisation,
  OrgAccessRequest,
  Organisation,
  OrganisationWithStats,
  OrganisationDetail,
  OrganisationRevenue,
  PlatformHealth,
  PlatformSettings,
  PlatformStats,
  RevenueSummary,
  Role,
  SupportTicket,
  SupportTicketDetail,
  TicketStatus,
} from '@/types';
import type { AccessScope } from '@geolandpro/rbac';

interface ListOrganisationsParams {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
}

export interface CreateOrganisationBody {
  name: string;
  slug?: string;
  logoUrl?: string;
  country?: string;
  currency?: string;
  timezone?: string;
  subscriptionTier?: string;
  commissionRate?: number;
  maxProperties?: number;
  maxUsers?: number;
  adminEmail: string;
  adminFirstName: string;
  adminLastName: string;
  adminPhone?: string;
}

export interface CreateOrganisationResult {
  organisation: Organisation;
  adminUser: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    role: Role;
    isActive: boolean;
    isEmailVerified: boolean;
    lastLoginAt: string | null;
    createdAt: string;
  };
  temporaryPassword: string;
}

export interface UpdateOrganisationBody {
  name?: string;
  slug?: string;
  logoUrl?: string;
  country?: string;
  currency?: string;
  timezone?: string;
  isActive?: boolean;
  subscriptionTier?: string;
  commissionRate?: number;
  maxProperties?: number;
  maxUsers?: number;
}

export interface CreateAccessRequestBody {
  requestedScopes: AccessScope[];
  reason?: string;
}

interface ListMyAccessRequestsParams {
  page?: number;
  limit?: number;
  status?: AccessRequestStatus;
}

export interface DeleteOrganisationResult {
  status: 'confirmation_required' | 'deleted';
  message: string;
  confirmationToken?: string;
  expiresAt?: string;
}

export interface ListAuditLogsParams {
  page?: number;
  limit?: number;
  organisationId?: string;
  actor?: string;
  action?: string;
  entityType?: string;
  from?: string;
  to?: string;
}

export interface UpdatePlatformSettingsBody {
  defaultCommissionRate?: number;
  maintenanceMode?: boolean;
}

export interface ListSupportTicketsParams {
  page?: number;
  limit?: number;
  status?: TicketStatus;
  organisationId?: string;
}

export const platformApi = {
  async getStats() {
    const { data } = await api.get<ApiResponse<PlatformStats>>('/platform/stats');
    return data.data;
  },

  async listOrganisations(params: ListOrganisationsParams = {}) {
    const { data } = await api.get<ApiListResponse<OrganisationWithStats>>('/platform/organisations', { params });
    return data;
  },

  async getOrganisation(id: string) {
    const { data } = await api.get<ApiResponse<OrganisationDetail>>(`/platform/organisations/${id}`);
    return data.data;
  },

  async createOrganisation(body: CreateOrganisationBody) {
    const { data } = await api.post<ApiResponse<CreateOrganisationResult>>('/platform/organisations', body);
    return data.data;
  },

  async updateOrganisation(id: string, body: UpdateOrganisationBody) {
    const { data } = await api.patch<ApiResponse<Organisation>>(`/platform/organisations/${id}`, body);
    return data.data;
  },

  async suspendOrganisation(id: string) {
    const { data } = await api.delete<ApiResponse<Organisation>>(`/platform/organisations/${id}/suspend`);
    return data.data;
  },

  async activateOrganisation(id: string) {
    const { data } = await api.patch<ApiResponse<Organisation>>(`/platform/organisations/${id}/activate`);
    return data.data;
  },

  // ─── Master-Control Impersonation Integration ──────────────────────────────
  // Creates a consent-gated OrgAccessRequest (PENDING). The landowner must
  // accept it in apps/web (Approve sets grantedScopes + expiry) before the ops
  // manager can "Enter" — Master Control never sets or reads the impersonation
  // cookie; see ClientsPage/OrganisationDetailPage for the status-aware control.
  async createAccessRequest(organisationId: string, body: CreateAccessRequestBody) {
    const { data } = await api.post<ApiResponse<OrgAccessRequest>>(
      `/platform/organisations/${organisationId}/access-requests`,
      body
    );
    return data.data;
  },

  async listMyAccessRequests(params: ListMyAccessRequestsParams = {}) {
    const { data } = await api.get<ApiListResponse<OrgAccessRequest>>('/platform/access-requests/mine', {
      params,
    });
    return data;
  },

  async deleteOrganisation(id: string, confirmationToken?: string) {
    const { data } = await api.delete<{ success: boolean } & DeleteOrganisationResult>(
      `/platform/organisations/${id}`,
      { data: confirmationToken ? { confirmationToken } : {} }
    );
    return data;
  },

  async getRevenueSummary() {
    const { data } = await api.get<ApiResponse<RevenueSummary>>('/platform/revenue/summary');
    return data.data;
  },

  async listOrganisationRevenue(params: ListOrganisationsParams = {}) {
    const { data } = await api.get<ApiListResponse<OrganisationRevenue>>('/platform/revenue/organisations', {
      params,
    });
    return data;
  },

  async listAuditLogs(params: ListAuditLogsParams = {}) {
    const { data } = await api.get<ApiListResponse<AuditLogEntry>>('/platform/audit-logs', { params });
    return data;
  },

  async exportAuditLogsPdf(params: ListAuditLogsParams = {}) {
    const { data } = await api.get<Blob>('/platform/audit-logs/export', { params, responseType: 'blob' });
    return data;
  },

  async getSettings() {
    const { data } = await api.get<ApiResponse<PlatformSettings>>('/platform/settings');
    return data.data;
  },

  async updateSettings(body: UpdatePlatformSettingsBody) {
    const { data } = await api.patch<ApiResponse<PlatformSettings>>('/platform/settings', body);
    return data.data;
  },

  async getHealth() {
    const { data } = await api.get<ApiResponse<PlatformHealth>>('/platform/health');
    return data.data;
  },

  async listOnboarding() {
    const { data } = await api.get<ApiResponse<OnboardingOrganisation[]>>('/platform/onboarding');
    return data.data;
  },

  async updateOnboardingStage(id: string, stage: number) {
    const { data } = await api.patch<ApiResponse<Organisation>>(`/platform/organisations/${id}/onboarding-stage`, {
      stage,
    });
    return data.data;
  },

  async listSupportTickets(params: ListSupportTicketsParams = {}) {
    const { data } = await api.get<ApiListResponse<SupportTicket>>('/platform/support/tickets', { params });
    return data;
  },

  async getSupportTicket(id: string) {
    const { data } = await api.get<ApiResponse<SupportTicketDetail>>(`/platform/support/tickets/${id}`);
    return data.data;
  },

  async replySupportTicket(id: string, message: string) {
    const { data } = await api.post<ApiResponse<SupportTicket>>(`/platform/support/tickets/${id}/reply`, { message });
    return data.data;
  },

  async escalateSupportTicket(id: string) {
    const { data } = await api.post<ApiResponse<SupportTicket>>(`/platform/support/tickets/${id}/escalate`);
    return data.data;
  },

  async closeSupportTicket(id: string) {
    const { data } = await api.post<ApiResponse<SupportTicket>>(`/platform/support/tickets/${id}/close`);
    return data.data;
  },
};
