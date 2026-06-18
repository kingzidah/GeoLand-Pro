import { api } from './client';
import type { Notification, ApiListResponse } from '@/types';

export const notificationsApi = {
  async list(params: { page?: number; limit?: number; status?: string } = {}) {
    const { data } = await api.get<ApiListResponse<Notification>>('/notifications', { params });
    return data;
  },
};
