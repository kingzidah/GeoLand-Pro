import express, { Application, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import { requestId, sanitiseBody, noCache } from './middleware/security.middleware';
import { apiRouter } from './routes';
import { ApiError } from './utils/ApiError';
import { prisma } from './config/database';
import { startAllJobs } from './jobs';

const app: Application = express();

// ─── Trust proxy ─────────────────────────────────────────────────────────────
// Required on Railway (and other reverse-proxy platforms) so req.ip and
// req.secure reflect the original client, not the proxy hop.
app.set('trust proxy', 1);

// ─── Background jobs ─────────────────────────────────────────────────────────
startAllJobs();

// ─── Request tracing ─────────────────────────────────────────────────────────
app.use(requestId);

// ─── Security headers ────────────────────────────────────────────────────────
app.use(helmet());

// ─── Response compression ────────────────────────────────────────────────────
app.use(compression());

// ─── CORS ────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Postman)
      if (!origin || env.CORS_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new ApiError(403, `CORS: origin '${origin}' not allowed`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-impersonation-active', 'x-refresh'],
  })
);

// ─── Body parsing ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Cookie parsing (impersonation_token — see middleware/impersonation.ts) ──
app.use(cookieParser());

// ─── Sanitise request bodies (prototype pollution prevention) ────────────────
app.use(sanitiseBody);

// ─── HTTP request logging ────────────────────────────────────────────────────
app.use(requestLogger);

// ─── Health check (no auth required) ─────────────────────────────────────────
app.get('/health', noCache, async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: 'ok',
      service: 'geolandpro-api',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({
      status: 'error',
      service: 'geolandpro-api',
      database: 'disconnected',
      timestamp: new Date().toISOString(),
    });
  }
});

// ─── API routes ───────────────────────────────────────────────────────────────
app.use('/api/v1', apiRouter);

// ─── 404 fallthrough ─────────────────────────────────────────────────────────
app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(new ApiError(404, 'The requested route does not exist'));
});

// ─── Centralised error handler (must be last) ────────────────────────────────
app.use(errorHandler);

export default app;
