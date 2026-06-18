import { api } from './client';
import type { PlotDetail, ApiResponse } from '@/types';

export const plotsApi = {
  async getById(plotId: string) {
    const { data } = await api.get<ApiResponse<PlotDetail>>(`/plots/${plotId}`);
    return data.data;
  },
};
