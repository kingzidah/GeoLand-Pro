import { api } from './client';
import type { TenantProfile, ApiResponse } from '@/types';

export const tenantsApi = {
  async getMyProfile(userId: string) {
    const { data } = await api.get<ApiResponse<TenantProfile>>(`/tenants/${userId}`);
    return data.data;
  },

  async createProfile(userId: string, body: {
    nationalIdType: string;
    nationalIdNumber: string;
    dateOfBirth?: string;
    occupation?: string;
    emergencyContact?: { name: string; phone: string; relationship: string };
  }) {
    const { data } = await api.post<ApiResponse<TenantProfile>>(`/tenants/${userId}/profile`, body);
    return data.data;
  },

  async updateProfile(userId: string, body: {
    occupation?: string;
    emergencyContact?: { name: string; phone: string; relationship: string };
  }) {
    const { data } = await api.patch<ApiResponse<TenantProfile>>(`/tenants/${userId}/profile`, body);
    return data.data;
  },
};
