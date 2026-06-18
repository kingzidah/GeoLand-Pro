import { api } from './client';
import type { GeofenceAlert, AlertEvent, ApiListResponse } from '@/types';

export const alertsApi = {
  async list(params: { propertyId?: string; limit?: number } = {}) {
    const { data } = await api.get<ApiListResponse<GeofenceAlert>>('/alerts', { params });
    return data;
  },

  async listEvents(alertId: string, params: { eventType?: string; limit?: number } = {}) {
    const { data } = await api.get<ApiListResponse<AlertEvent>>(`/alerts/${alertId}/events`, {
      params,
    });
    return data;
  },
};
