import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps an async Express handler so rejected promises are forwarded to next().
 * Eliminates try/catch boilerplate in every controller method.
 *
 * Usage:
 *   router.get('/foo', asyncHandler(async (req, res) => { ... }));
 */
export const asyncHandler =
  (fn: RequestHandler): RequestHandler =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
