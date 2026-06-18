import { env } from '../config/env';
import { logger } from '../config/logger';
import { ApiError } from '../utils/ApiError';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// ─── Core chat helper ──────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Ask the model to return a raw JSON object (no markdown fences). */
  json?: boolean;
}

async function chatCompletion(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
  let response: Response;

  try {
    response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://geolandpro.com',
        'X-Title': 'GeoLand Pro',
      },
      body: JSON.stringify({
        model: options.model ?? env.OPENROUTER_MODEL,
        messages,
        temperature: options.temperature ?? 0.3,
        ...(options.maxTokens && { max_tokens: options.maxTokens }),
        ...(options.json && { response_format: { type: 'json_object' } }),
      }),
    });
  } catch (err) {
    logger.error('OpenRouter request failed (network error)', { error: (err as Error).message });
    throw ApiError.internal('AI service is currently unreachable');
  }

  if (!response.ok) {
    const body = await response.text();
    logger.error('OpenRouter request failed', { status: response.status, body });
    throw ApiError.internal('AI service request failed');
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    logger.error('OpenRouter response had no content', { data });
    throw ApiError.internal('AI service returned an empty response');
  }

  return content;
}

async function chatJSON<T>(messages: ChatMessage[], options: ChatOptions = {}): Promise<T> {
  const content = await chatCompletion(messages, { ...options, json: true });

  try {
    return JSON.parse(content) as T;
  } catch (err) {
    logger.error('Failed to parse AI JSON response', { content });
    throw ApiError.internal('AI service returned an invalid response');
  }
}

// ─── 1. Property assistant ─────────────────────────────────────────────────────

async function propertyAssistant(question: string, propertyStats: object): Promise<string> {
  return chatCompletion([
    {
      role: 'system',
      content:
        'You are a property management assistant for GeoLand Pro, a land/estate management platform in Ghana. ' +
        'Answer the user\'s question using ONLY the JSON data provided below. ' +
        'Be concise and specific — name plots, tenants, and amounts where relevant. ' +
        'If the data does not contain enough information to answer, say so plainly. ' +
        'Currency is Ghana Cedis (GHS).\n\n' +
        `DATA:\n${JSON.stringify(propertyStats)}`,
    },
    { role: 'user', content: question },
  ]);
}

// ─── 2. Document intelligence ──────────────────────────────────────────────────

export interface ExtractedDocumentData {
  ownerName: string | null;
  plotId: string | null;
  area: number | null;
  boundaries: string | null;
  coordinates: { lat: number; lng: number }[] | null;
  registeredDate: string | null;
  documentType: string | null;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
}

async function extractDocumentData(documentText: string): Promise<ExtractedDocumentData> {
  return chatJSON<ExtractedDocumentData>([
    {
      role: 'system',
      content:
        'You are a document intelligence engine for a land management platform in Ghana. ' +
        'Extract structured data from the land document text provided (e.g. an indenture, site plan ' +
        'description, or tenancy/lease agreement) so it can auto-populate a form. ' +
        'Respond with ONLY a JSON object matching this exact shape (use null for unknown fields):\n' +
        '{\n' +
        '  "ownerName": string | null,\n' +
        '  "plotId": string | null,\n' +
        '  "area": number | null (square metres),\n' +
        '  "boundaries": string | null (textual description of boundary neighbours/markers),\n' +
        '  "coordinates": [{ "lat": number, "lng": number }] | null,\n' +
        '  "registeredDate": string | null (ISO 8601 date),\n' +
        '  "documentType": string | null,\n' +
        '  "confidence": "LOW" | "MEDIUM" | "HIGH"\n' +
        '}',
    },
    { role: 'user', content: `DOCUMENT TEXT:\n${documentText}` },
  ]);
}

// ─── 3. Tenant risk scoring ─────────────────────────────────────────────────────

export interface TenantRiskStats {
  totalPayments: number;
  onTimePayments: number;
  latePayments: number;
  avgDaysLate: number;
  partialPayments: number;
  monthsActive: number;
  currentArrears: number;
}

export interface TenantRiskScore {
  score: number;
  band: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  factors: string[];
  prediction: string;
  action: string;
}

async function scoreTenantRisk(stats: TenantRiskStats): Promise<TenantRiskScore> {
  return chatJSON<TenantRiskScore>([
    {
      role: 'system',
      content:
        'You are a tenant payment risk model for a land/property management platform in Ghana. ' +
        'Analyse the tenant\'s rent payment history and arrears to produce a risk score. ' +
        'A higher score means higher risk of continued non-payment. ' +
        'Consider: payment consistency, lateness patterns, current arrears, and tenure. ' +
        'Respond with ONLY a JSON object matching this exact shape:\n' +
        '{\n' +
        '  "score": number (0-100),\n' +
        '  "band": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",\n' +
        '  "factors": string[] (key drivers of the score),\n' +
        '  "prediction": string (1-2 sentences on likely future behaviour),\n' +
        '  "action": string (recommended next step for the property manager)\n' +
        '}',
    },
    { role: 'user', content: JSON.stringify(stats) },
  ]);
}

// ─── 4. Automated monthly report ────────────────────────────────────────────────

export interface MonthlyReportData {
  propertyName: string;
  month: string;
  totalPlots: number;
  occupancy: number;
  income: number;
  arrears: number;
  alerts: number;
  newTenants: number;
  currency: string;
}

async function generateMonthlyReport(data: MonthlyReportData): Promise<string> {
  return chatCompletion([
    {
      role: 'system',
      content:
        'You are a property portfolio analyst writing a monthly performance report for a land/estate ' +
        'management company in Ghana. Given the property statistics for the period, write a clear, ' +
        'professional report formatted in markdown with sections for: a title, an executive summary, ' +
        'performance highlights, risks/concerns, and recommendations.',
    },
    { role: 'user', content: JSON.stringify(data) },
  ]);
}

// ─── 5. Health check ────────────────────────────────────────────────────────────

async function aiHealthCheck(): Promise<boolean> {
  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
    });
    return response.ok;
  } catch (err) {
    logger.error('AI health check failed', { error: (err as Error).message });
    return false;
  }
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const aiService = {
  propertyAssistant,
  extractDocumentData,
  scoreTenantRisk,
  generateMonthlyReport,
  aiHealthCheck,
};
