import { api } from './client';
import type {
  ApiResponse,
  Plot,
  SurveyImportBody,
  SurveyImportRecord,
  SurveyPoint,
  SurveySession,
  SurveyValidateResult,
} from '@/types';

interface SurveyPointCaptureBody {
  sessionId: string;
  pointIndex: number;
  latitude: number;
  longitude: number;
  elevation?: number;
  accuracy?: number;
  timestamp?: string;
  label?: string;
  notes?: string;
}

interface SurveySessionCloseBody {
  plotLabel?: string;
  status?: string;
  notes?: string;
}

export const surveyApi = {
  /** Downloads the RTK GPS CSV template as a Blob (Content-Disposition: attachment). */
  async getTemplate(propertyId: string) {
    const { data } = await api.get<Blob>(`/properties/${propertyId}/survey/template`, {
      responseType: 'blob',
    });
    return data;
  },

  async validate(propertyId: string, body: SurveyImportBody) {
    const { data } = await api.post<ApiResponse<SurveyValidateResult>>(
      `/properties/${propertyId}/survey/validate`,
      body
    );
    return data.data;
  },

  async import(propertyId: string, body: SurveyImportBody) {
    const { data } = await api.post<ApiResponse<Plot[]>>(
      `/properties/${propertyId}/survey/import`,
      body
    );
    return data.data;
  },

  async addPoint(propertyId: string, body: SurveyPointCaptureBody) {
    const { data } = await api.post<ApiResponse<SurveyPoint>>(
      `/properties/${propertyId}/survey/points`,
      body
    );
    return data.data;
  },

  async listSessions(propertyId: string) {
    const { data } = await api.get<ApiResponse<SurveySession[]>>(
      `/properties/${propertyId}/survey/sessions`
    );
    return data.data;
  },

  async getSessionPoints(propertyId: string, sessionId: string) {
    const { data } = await api.get<ApiResponse<SurveyPoint[]>>(
      `/properties/${propertyId}/survey/points/${sessionId}`
    );
    return data.data;
  },

  async closeSession(propertyId: string, sessionId: string, body: SurveySessionCloseBody = {}) {
    const { data } = await api.post<ApiResponse<Plot>>(
      `/properties/${propertyId}/survey/points/${sessionId}/close`,
      body
    );
    return data.data;
  },

  async listImports(propertyId: string) {
    const { data } = await api.get<ApiResponse<SurveyImportRecord[]>>(
      `/properties/${propertyId}/survey/imports`
    );
    return data.data;
  },
};
