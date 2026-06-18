import { api } from './client';
import type { ApiResponse } from '@/types';

export const aiApi = {
  async assistant(question: string, propertyId: string) {
    const { data } = await api.post<ApiResponse<{ answer: string }>>('/ai/assistant', {
      question,
      propertyId,
    });
    return data.data.answer;
  },
};
