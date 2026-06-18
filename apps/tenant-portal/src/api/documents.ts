import { api } from './client';
import type { Document, ApiListResponse, ApiResponse } from '@/types';

export const documentsApi = {
  async list(params: { page?: number; limit?: number; type?: string; leaseId?: string } = {}) {
    const { data } = await api.get<ApiListResponse<Document>>('/documents', { params });
    return data;
  },

  async getDownloadUrl(id: string) {
    const { data } = await api.get<ApiResponse<{ downloadUrl: string; expiresIn: number }>>(
      `/documents/${id}/download-url`
    );
    return data.data;
  },
};
