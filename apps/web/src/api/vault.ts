import { api } from './client';
import type { VaultStatus, VaultSubscription, VaultPackResult, ApiResponse } from '@/types';

export const vaultApi = {
  async getStatus(propertyId: string) {
    const { data } = await api.get<ApiResponse<VaultStatus>>(`/vault/${propertyId}/status`);
    return data.data;
  },

  async subscribe(propertyId: string, body: { physicalVault: boolean; deliveryAddress?: string }) {
    const { data } = await api.post<ApiResponse<VaultSubscription>>(
      `/vault/${propertyId}/subscribe`,
      body
    );
    return data.data;
  },

  async generatePack(propertyId: string) {
    const { data } = await api.post<ApiResponse<VaultPackResult>>(
      `/vault/${propertyId}/generate-pack`
    );
    return data.data;
  },

  async requestPhysicalVault(propertyId: string, body: { name: string; deliveryAddress: string; contactNumber: string }) {
    const { data } = await api.post<ApiResponse<{ success: boolean }>>(
      `/vault/${propertyId}/request-physical-vault`,
      body
    );
    return data.data;
  },

  async confirmDelivery(propertyId: string) {
    const { data } = await api.patch<ApiResponse<VaultSubscription>>(
      `/vault/${propertyId}/confirm-delivery`
    );
    return data.data;
  },
};
