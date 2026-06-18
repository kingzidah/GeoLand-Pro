import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { ApiError } from '../utils/ApiError';
import { logger } from '../config/logger';
import { env } from '../config/env';

interface ErrorResponse {
  success: false;
  message: string;
  errors?: unknown;
  stack?: string;
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void => {
  // ─── Zod validation errors ───────────────────────────────────────────────
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: err.flatten().fieldErrors,
    } satisfies ErrorResponse);
    return;
  }

  // ─── Prisma known request errors ─────────────────────────────────────────
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
      res.status(409).json({
        success: false,
        message: `A record with this ${target} already exists`,
      } satisfies ErrorResponse);
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({
        success: false,
        message: 'Record not found',
      } satisfies ErrorResponse);
      return;
    }
    if (err.code === 'P2003') {
      res.status(400).json({
        success: false,
        message: 'Related record does not exist',
      } satisfies ErrorResponse);
      return;
    }
  }

  // ─── Prisma validation errors ─────────────────────────────────────────────
  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({
      success: false,
      message: 'Invalid data supplied to the database',
    } satisfies ErrorResponse);
    return;
  }

  // ─── Our own operational API errors ──────────────────────────────────────
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.errors !== undefined && { errors: err.errors }),
    } satisfies ErrorResponse);
    return;
  }

  // ─── Unknown / programming errors ────────────────────────────────────────
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    method: req.method,
    path: req.path,
    ip: req.ip,
  });

  res.status(500).json({
    success: false,
    message: 'An unexpected error occurred',
    ...(env.NODE_ENV !== 'production' && { stack: err.stack }),
  } satisfies ErrorResponse);
};
