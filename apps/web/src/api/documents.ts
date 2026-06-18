import { api } from './client';
import type { Document, ApiListResponse, ApiResponse } from '@/types';

interface ListDocumentsParams {
  page?: number;
  limit?: number;
  plotId?: string;
  leaseId?: string;
  type?: string;
}

export const documentsApi = {
  async list(params: ListDocumentsParams = {}) {
    const { data } = await api.get<ApiListResponse<Document>>('/documents', { params });
    return data;
  },

  async getById(id: string) {
    const { data } = await api.get<ApiResponse<Document>>(`/documents/${id}`);
    return data.data;
  },

  async getDownloadUrl(id: string) {
    const { data } = await api.get<ApiResponse<{ downloadUrl: string; expiresIn: number }>>(
      `/documents/${id}/download-url`
    );
    return data.data;
  },

  async generateLeaseDoc(leaseId: string) {
    const { data } = await api.post<ApiResponse<Document>>(
      `/documents/generate/lease/${leaseId}`
    );
    return data.data;
  },

  async generateReceiptDoc(transactionId: string) {
    const { data } = await api.post<ApiResponse<Document>>(
      `/documents/generate/receipt/${transactionId}`
    );
    return data.data;
  },

  async generateBoundaryCertificate(plotId: string) {
    const { data } = await api.post<ApiResponse<Document>>(
      `/documents/generate/boundary-cert/${plotId}`
    );
    return data.data;
  },

  async generatePlotCertificate(plotId: string) {
    const { data } = await api.post<ApiResponse<Document>>(
      `/documents/generate/plot-cert/${plotId}`
    );
    return data.data;
  },

  async generateDemandLetter(leaseId: string) {
    const { data } = await api.post<ApiResponse<Document>>(
      `/documents/generate/demand-letter/${leaseId}`
    );
    return data.data;
  },

  async generateLCSubmissionPackage(plotId: string) {
    const { data } = await api.post<ApiResponse<Document>>(
      `/documents/generate/lc-package/${plotId}`
    );
    return data.data;
  },

  async generateAnnualReport(propertyId: string, year?: number) {
    const { data } = await api.post<ApiResponse<Document>>(
      `/documents/generate/annual-report/${propertyId}`,
      undefined,
      { params: year ? { year } : undefined }
    );
    return data.data;
  },

  async delete(id: string) {
    await api.delete(`/documents/${id}`);
  },
};
