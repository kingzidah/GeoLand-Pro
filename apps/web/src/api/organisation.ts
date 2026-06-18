import { api } from './client';
import type { ApiResponse, Role } from '@/types';

interface InviteCodeResult {
  code: string;
  link: string;
  role: Role;
  expiresAt: string;
}

export const organisationApi = {
  async createInvite(body: { role: Role; expiresInDays?: number }) {
    const { data } = await api.post<ApiResponse<InviteCodeResult>>('/org/invite', body);
    return data.data;
  },
};
