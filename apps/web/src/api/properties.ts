import { api } from './client';
import type {
  Property,
  Plot,
  MapPlot,
  ApiListResponse,
  ApiResponse,
  UpdatePropertyBoundaryBody,
} from '@/types';

interface ListPropertiesParams {
  page?: number;
  limit?: number;
  search?: string;
  region?: string;
}

interface ListPlotsParams {
  page?: number;
  limit?: number;
  status?: string;
}

export interface CreatePropertyBody {
  name: string;
  address: string;
  region: string;
  district: string;
  totalAreaSqm: number;
  description?: string;
  boundaryGeoJSON?: object;
}

interface CreatePlotBody {
  plotNumber: string;
  areaSqm: number;
  boundaryGeoJSON: object;
  centroidLat?: number;
  centroidLng?: number;
  description?: string;
}

export const propertiesApi = {
  async list(params: ListPropertiesParams = {}) {
    const { data } = await api.get<ApiListResponse<Property>>('/properties', { params });
    return data;
  },

  async getById(id: string) {
    const { data } = await api.get<ApiResponse<Property>>(`/properties/${id}`);
    return data.data;
  },

  async create(body: CreatePropertyBody) {
    const { data } = await api.post<ApiResponse<Property>>('/properties', body);
    return data.data;
  },

  async update(id: string, body: Partial<CreatePropertyBody>) {
    const { data } = await api.patch<ApiResponse<Property>>(`/properties/${id}`, body);
    return data.data;
  },

  async deactivate(id: string) {
    await api.delete(`/properties/${id}`);
  },

  async addManager(propertyId: string, managerId: string) {
    await api.post(`/properties/${propertyId}/managers`, { managerId });
  },

  async removeManager(propertyId: string, managerId: string) {
    await api.delete(`/properties/${propertyId}/managers/${managerId}`);
  },

  async updateBoundary(propertyId: string, body: UpdatePropertyBoundaryBody) {
    const { data } = await api.patch<ApiResponse<Property>>(
      `/properties/${propertyId}/boundary`,
      body
    );
    return data.data;
  },

  // ─── Plots ──────────────────────────────────────────────────────────────────

  async listPlots(propertyId: string, params: ListPlotsParams = {}) {
    const { data } = await api.get<ApiListResponse<Plot>>(
      `/properties/${propertyId}/plots`,
      { params }
    );
    return data;
  },

  /** Unpaginated, minimal-field listing for rendering an entire estate on a map in one request. */
  async listPlotsForMap(propertyId: string) {
    const { data } = await api.get<ApiResponse<MapPlot[]> & { meta: { total: number } }>(
      `/properties/${propertyId}/plots/map`
    );
    return data.data;
  },

  async getPlot(propertyId: string, plotId: string) {
    const { data } = await api.get<ApiResponse<Plot>>(
      `/properties/${propertyId}/plots/${plotId}`
    );
    return data.data;
  },

  async createPlot(propertyId: string, body: CreatePlotBody) {
    const { data } = await api.post<ApiResponse<Plot>>(
      `/properties/${propertyId}/plots`,
      body
    );
    return data.data;
  },

  async updatePlot(propertyId: string, plotId: string, body: Partial<CreatePlotBody>) {
    const { data } = await api.patch<ApiResponse<Plot>>(
      `/properties/${propertyId}/plots/${plotId}`,
      body
    );
    return data.data;
  },

  async updatePlotStatus(propertyId: string, plotId: string, status: string) {
    const { data } = await api.patch<ApiResponse<Plot>>(
      `/properties/${propertyId}/plots/${plotId}/status`,
      { status }
    );
    return data.data;
  },
};
