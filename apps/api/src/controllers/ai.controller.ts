import { Request, Response } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../config/database';
import { aiService } from '../services/ai.service';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthenticatedRequest } from '../middleware/authenticate';
import type { AssistantInput, ExtractDocumentInput } from '../validations/ai.schema';

export const aiController = {
  assistant: asyncHandler(async (req: Request, res: Response) => {
    const { question, propertyId } = req.body as AssistantInput;
    const { id: userId, role } = (req as AuthenticatedRequest).user;

    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        name: true,
        address: true,
        region: true,
        totalAreaSqm: true,
        isActive: true,
        managers: { select: { id: true } },
        plots: { select: { status: true } },
      },
    });

    if (!property || !property.isActive) {
      throw ApiError.notFound('Property');
    }

    if (role !== Role.SUPER_ADMIN && !property.managers.some((m) => m.id === userId)) {
      throw ApiError.forbidden();
    }

    const plotsByStatus = property.plots.reduce<Record<string, number>>((acc, plot) => {
      acc[plot.status] = (acc[plot.status] ?? 0) + 1;
      return acc;
    }, {});

    const propertyStats = {
      name: property.name,
      address: property.address,
      region: property.region,
      totalAreaSqm: property.totalAreaSqm,
      totalPlots: property.plots.length,
      plotsByStatus,
    };

    const answer = await aiService.propertyAssistant(question, propertyStats);
    res.status(200).json({ success: true, data: { answer } });
  }),

  extractDocument: asyncHandler(async (req: Request, res: Response) => {
    const { text } = req.body as ExtractDocumentInput;
    const data = await aiService.extractDocumentData(text);
    res.status(200).json({ success: true, data });
  }),

  health: asyncHandler(async (_req: Request, res: Response) => {
    const ok = await aiService.aiHealthCheck();
    res.status(200).json({ ok });
  }),
};
