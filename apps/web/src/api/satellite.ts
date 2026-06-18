import axios from 'axios';
import { api } from './client';
import type { SatelliteImage, SatelliteHealth, SatelliteInfo, ApiResponse } from '@/types';

export const satelliteApi = {
  async health() {
    const { data } = await api.get<ApiResponse<SatelliteHealth>>('/satellite/health');
    return data.data;
  },

  /** Returns null when the property has no GPS boundary yet (400) or no access. */
  async getInfo(propertyId: string) {
    try {
      const { data } = await api.get<ApiResponse<SatelliteInfo>>(`/satellite/${propertyId}/info`);
      return data.data;
    } catch (err) {
      if (axios.isAxiosError(err) && (err.response?.status === 400 || err.response?.status === 404)) {
        return null;
      }
      throw err;
    }
  },

  /** Returns null (instead of throwing) when no image has been captured yet. */
  async getLatest(propertyId: string) {
    try {
      const { data } = await api.get<ApiResponse<SatelliteImage>>(`/satellite/${propertyId}/latest`);
      return data.data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      throw err;
    }
  },

  async getHistory(propertyId: string) {
    const { data } = await api.get<ApiResponse<SatelliteImage[]>>(
      `/satellite/${propertyId}/history`
    );
    return data.data;
  },

  async createOrder(propertyId: string, body: { tier: 2 | 3 | 4; notes?: string }) {
    const { data } = await api.post<ApiResponse<SatelliteImage>>(
      `/satellite/${propertyId}/order`,
      body
    );
    return data.data;
  },
};
