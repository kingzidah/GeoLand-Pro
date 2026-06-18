import { api } from './client';
import type { Transaction, FinanceSummary, ArrearsLease, ApiListResponse, ApiResponse } from '@/types';

interface ListTransactionsParams {
  page?: number;
  limit?: number;
  leaseId?: string;
  type?: string;
  status?: string;
}

export const financeApi = {
  async listTransactions(params: ListTransactionsParams = {}) {
    const { data } = await api.get<ApiListResponse<Transaction>>('/transactions', { params });
    return data;
  },

  async recordPayment(body: {
    leaseId: string;
    rentRecordId?: string;
    type: string;
    amountGHS: number;
    paymentMethod?: string;
    paymentReference?: string;
    notes?: string;
  }) {
    const { data } = await api.post<ApiResponse<Transaction>>('/transactions', body);
    return data.data;
  },

  async getSummary(propertyId?: string) {
    const { data } = await api.get<ApiResponse<FinanceSummary>>('/finance/summary', {
      params: propertyId ? { propertyId } : {},
    });
    return data.data;
  },

  async getArrears(propertyId?: string) {
    const { data } = await api.get<ApiResponse<ArrearsLease[]>>('/finance/arrears', {
      params: propertyId ? { propertyId } : {},
    });
    return data.data;
  },

  async markCommissionPaid(commissionId: string) {
    await api.patch(`/finance/commissions/${commissionId}/pay`);
  },
};
