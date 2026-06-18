import { z } from 'zod';

export const assistantSchema = z.object({
  question: z.string().min(1, 'Question is required').max(2000),
  propertyId: z.string().min(1, 'propertyId is required'),
});

export const extractDocumentSchema = z.object({
  text: z.string().min(1, 'Document text is required'),
});

export type AssistantInput = z.infer<typeof assistantSchema>;
export type ExtractDocumentInput = z.infer<typeof extractDocumentSchema>;
