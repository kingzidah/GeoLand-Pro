import { api } from './client';
import type { TenantProfile, Lease, ApiListResponse, ApiResponse } from '@/types';

interface ListTenantsParams {
  page?: number;
  limit?: number;
  search?: string;
}

export const tenantsApi = {
  async list(params: ListTenantsParams = {}) {
    const { data } = await api.get<ApiListResponse<TenantProfile>>('/tenants', { params });
    return data;
  },

  async getById(id: string) {
    const { data } = await api.get<ApiResponse<TenantProfile>>(`/tenants/${id}`);
    return data.data;
  },

  async getByUserId(userId: string) {
    const { data } = await api.get<ApiResponse<TenantProfile>>(`/tenants/user/${userId}`);
    return data.data;
  },

  async getLeases(tenantProfileId: string) {
    const { data } = await api.get<ApiResponse<Lease[]>>(`/tenants/${tenantProfileId}/leases`);
    return data.data;
  },

  async createProfile(body: {
    userId: string;
    nationalIdType: string;
    nationalIdNumber: string;
    dateOfBirth?: string;
    occupation?: string;
    emergencyContact?: { name: string; phone: string; relationship: string };
  }) {
    const { data } = await api.post<ApiResponse<TenantProfile>>('/tenants', body);
    return data.data;
  },

  async updateProfile(id: string, body: {
    occupation?: string;
    emergencyContact?: { name: string; phone: string; relationship: string };
  }) {
    const { data } = await api.patch<ApiResponse<TenantProfile>>(`/tenants/${id}`, body);
    return data.data;
  },
};
