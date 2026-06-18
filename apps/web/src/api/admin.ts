import { api } from './client';
import type { User, AdminStats, ApiListResponse, ApiResponse } from '@/types';

interface ListUsersParams {
  page?: number;
  limit?: number;
  role?: string;
  isActive?: boolean;
  search?: string;
}

export const adminApi = {
  async listUsers(params: ListUsersParams = {}) {
    const { data } = await api.get<ApiListResponse<User & {
      _count: { managedProperties: number; auditLogs: number };
      tenantProfile: { id: string; nationalIdNumber: string } | null;
    }>>('/admin/users', { params });
    return data;
  },

  async getUserById(id: string) {
    const { data } = await api.get<ApiResponse<User & {
      managedProperties: { id: string; name: string }[];
      tenantProfile: { id: string; nationalIdNumber: string } | null;
    }>>(`/admin/users/${id}`);
    return data.data;
  },

  async suspendUser(id: string) {
    await api.patch(`/admin/users/${id}/suspend`);
  },

  async activateUser(id: string) {
    await api.patch(`/admin/users/${id}/activate`);
  },

  async changeRole(id: string, role: string) {
    await api.patch(`/admin/users/${id}/role`, { role });
  },

  async getStats() {
    const { data } = await api.get<ApiResponse<AdminStats>>('/admin/stats');
    return data.data;
  },

  async listAuditLogs(params: {
    page?: number;
    limit?: number;
    userId?: string;
    entityType?: string;
    from?: string;
    to?: string;
  } = {}) {
    const { data } = await api.get<ApiListResponse<{
      id: string;
      action: string;
      entityType: string;
      entityId: string;
      metadata: unknown;
      ipAddress: string | null;
      createdAt: string;
      user: Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'role'>;
    }>>('/admin/audit-logs', { params });
    return data;
  },
};
