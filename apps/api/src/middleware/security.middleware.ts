import { Request, Response, NextFunction, RequestHandler } from 'express';

// ─────────────────────────────────────────────
// REQUEST ID — trace every request end-to-end
// ─────────────────────────────────────────────
export const requestId: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const id =
    (req.headers['x-request-id'] as string) ??
    `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  req.headers['x-request-id'] = id;
  res.setHeader('X-Request-ID', id);
  next();
};

// ─────────────────────────────────────────────
// SANITISE — strip prototype pollution attempts
// ─────────────────────────────────────────────
const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];

function sanitise(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sanitise);
  if (obj !== null && typeof obj === 'object') {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (!DANGEROUS_KEYS.includes(k)) clean[k] = sanitise(v);
    }
    return clean;
  }
  return obj;
}

export const sanitiseBody: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  if (req.body) req.body = sanitise(req.body);
  next();
};

// ─────────────────────────────────────────────
// NO CACHE — sensitive API responses
// ─────────────────────────────────────────────
export const noCache: RequestHandler = (
  _req: Request,
  res: Response,
  next: NextFunction
): void => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
};

// ─────────────────────────────────────────────
// CONTENT TYPE CHECK — block unexpected payloads
// ─────────────────────────────────────────────
export const requireJson: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const methodsWithBody = ['POST', 'PUT', 'PATCH'];
  if (
    methodsWithBody.includes(req.method) &&
    req.headers['content-type'] &&
    !req.headers['content-type'].includes('application/json') &&
    !req.headers['content-type'].includes('multipart/form-data')
  ) {
    res.status(415).json({ error: 'Unsupported Media Type' });
    return;
  }
  next();
};
