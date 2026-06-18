import { api } from './client';
import type {
  AccessRequestStatus,
  ApiListResponse,
  ApiResponse,
  OrgAccessRequest,
  OrganisationLite,
} from '@/types';
import type { AccessScope } from '@geolandpro/rbac';

interface ListAccessRequestsParams {
  page?: number;
  limit?: number;
  status?: AccessRequestStatus;
}

interface EnterResult {
  organisation: { id: string; name: string; slug: string };
  grantedScopes: AccessScope[];
  expiresAt: string;
  readOnly: true;
}

export const accessRequestsApi = {
  // ─── Staff (platform admin) ────────────────────────────────────────────────

  async create(organisationId: string, body: { requestedScopes: AccessScope[]; reason?: string }) {
    const { data } = await api.post<ApiResponse<OrgAccessRequest>>(
      `/platform/organisations/${organisationId}/access-requests`,
      body
    );
    return data.data;
  },

  async listMine(params: ListAccessRequestsParams = {}) {
    const { data } = await api.get<ApiListResponse<OrgAccessRequest>>('/platform/access-requests/mine', {
      params,
    });
    return data;
  },

  async enter(id: string) {
    const { data } = await api.post<ApiResponse<EnterResult>>(`/platform/access-requests/${id}/enter`);
    return data.data;
  },

  async exit(id: string) {
    await api.post(`/platform/access-requests/${id}/exit`);
  },

  async listOrganisationsLite(params: { search?: string; isActive?: boolean } = {}) {
    const { data } = await api.get<ApiListResponse<OrganisationLite>>('/platform/organisations', {
      params: { ...params, limit: 100 },
    });
    return data.data;
  },

  // ─── Approver (org SUPER_ADMIN) ────────────────────────────────────────────

  async listForOrg(params: ListAccessRequestsParams = {}) {
    const { data } = await api.get<ApiListResponse<OrgAccessRequest>>('/org/access-requests', { params });
    return data;
  },

  async approve(id: string, body: { grantedScopes: AccessScope[]; durationMinutes: number }) {
    const { data } = await api.patch<ApiResponse<OrgAccessRequest>>(
      `/org/access-requests/${id}/approve`,
      body
    );
    return data.data;
  },

  async deny(id: string) {
    const { data } = await api.patch<ApiResponse<OrgAccessRequest>>(`/org/access-requests/${id}/deny`);
    return data.data;
  },

  async revoke(id: string) {
    const { data } = await api.patch<ApiResponse<OrgAccessRequest>>(`/org/access-requests/${id}/revoke`);
    return data.data;
  },
};
