import { api } from './client';
import type { ImpersonationSession, User } from '@/types';

export const authApi = {
  async login(email: string, password: string) {
    const { data } = await api.post<{
      success: boolean;
      data: { user: User; accessToken: string };
    }>('/auth/login', { email, password });
    return data.data;
  },

  // Refresh token travels via the httpOnly refresh_token cookie (ADR-AUTH-001);
  // x-refresh is the CSRF guard for that cookie.
  async refresh() {
    const { data } = await api.post<{
      success: boolean;
      data: { accessToken: string };
    }>('/auth/refresh', {}, { headers: { 'x-refresh': '1' } });
    return data.data;
  },

  async logout() {
    await api.post('/auth/logout');
  },

  async getMe() {
    const { data } = await api.get<{
      success: boolean;
      data: User & { impersonation: ImpersonationSession | null };
    }>('/auth/me');
    return data.data;
  },

  async updateProfile(body: { firstName?: string; lastName?: string; phone?: string | null }) {
    const { data } = await api.patch<{ success: boolean; data: User }>('/auth/me', body);
    return data.data;
  },

  async changePassword(body: { currentPassword: string; newPassword: string }) {
    await api.post('/auth/change-password', body);
  },

  async forgotPassword(email: string) {
    await api.post('/auth/forgot-password', { email });
  },

  async resetPassword(body: { token: string; password: string }) {
    await api.post('/auth/reset-password', body);
  },
};
