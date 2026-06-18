import { api } from './client';
import type { Lease, RentRecord, ApiListResponse, ApiResponse } from '@/types';

export const leasesApi = {
  async list(params: { page?: number; limit?: number; status?: string } = {}) {
    const { data } = await api.get<ApiListResponse<Lease>>('/leases', { params });
    return data;
  },

  async getById(id: string) {
    const { data } = await api.get<ApiResponse<Lease>>(`/leases/${id}`);
    return data.data;
  },

  async getRentRecords(id: string) {
    const { data } = await api.get<ApiResponse<RentRecord[]>>(`/leases/${id}/rent-records`);
    return data.data;
  },

  async sign(id: string, signatureUrl: string) {
    const { data } = await api.post<ApiResponse<Lease>>(`/leases/${id}/sign`, { signatureUrl });
    return data.data;
  },
};
