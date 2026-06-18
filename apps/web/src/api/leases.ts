import { api } from './client';
import type { Lease, ApiListResponse, ApiResponse } from '@/types';

interface ListLeasesParams {
  page?: number;
  limit?: number;
  status?: string;
  propertyId?: string;
}

export const leasesApi = {
  async list(params: ListLeasesParams = {}) {
    const { data } = await api.get<ApiListResponse<Lease>>('/leases', { params });
    return data;
  },

  async getById(id: string) {
    const { data } = await api.get<ApiResponse<Lease>>(`/leases/${id}`);
    return data.data;
  },

  async create(body: {
    plotId: string;
    tenantUserId: string;
    startDate: string;
    endDate: string;
    monthlyRentGHS: number;
    depositAmountGHS?: number;
    notes?: string;
  }) {
    const { data } = await api.post<ApiResponse<Lease>>('/leases', body);
    return data.data;
  },

  async sign(id: string, signatureUrl: string) {
    const { data } = await api.post<ApiResponse<Lease>>(`/leases/${id}/sign`, { signatureUrl });
    return data.data;
  },

  async activate(id: string) {
    const { data } = await api.post<ApiResponse<Lease>>(`/leases/${id}/activate`);
    return data.data;
  },

  async terminate(id: string, terminationReason: string) {
    const { data } = await api.post<ApiResponse<Lease>>(`/leases/${id}/terminate`, {
      terminationReason,
    });
    return data.data;
  },
};
