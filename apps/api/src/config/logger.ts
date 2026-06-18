import winston from 'winston';
import path from 'path';
import { env } from './env';
import { brand } from './brand.config';

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

// ─── Sensitive field redaction ────────────────────────────────────────────────
// These fields are stripped from all log output, however deeply nested.
const REDACTED = [
  'password', 'token', 'accessToken', 'refreshToken',
  'secret', 'apiKey', 'nationalId', 'ghanaCard',
  'otp', 'pin', 'cvv', 'cardNumber',
];

const redactSensitive = winston.format((info) => {
  const redact = (obj: Record<string, unknown>): Record<string, unknown> => {
    if (!obj || typeof obj !== 'object') return obj;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (REDACTED.some((r) => k.toLowerCase().includes(r.toLowerCase()))) {
        out[k] = '[REDACTED]';
      } else if (v && typeof v === 'object') {
        out[k] = redact(v as Record<string, unknown>);
      } else {
        out[k] = v;
      }
    }
    return out;
  };
  return redact(info as unknown as Record<string, unknown>) as winston.Logform.TransformableInfo;
})();

// ─── Human-readable format for development ───────────────────────────────────
const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  redactSensitive,
  printf(({ level, message, timestamp: ts, stack, ...meta }) => {
    const metaStr =
      Object.keys(meta).length > 0 ? `\n  ${JSON.stringify(meta, null, 2)}` : '';
    return `${ts} [${level}]: ${stack ?? message}${metaStr}`;
  })
);

// ─── Structured JSON format for production (consumed by log aggregators) ────
const prodFormat = combine(timestamp(), errors({ stack: true }), redactSensitive, json());

const transports: winston.transport[] = [new winston.transports.Console()];

if (env.NODE_ENV === 'production') {
  transports.push(
    new winston.transports.File({
      filename: path.join('logs', 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10 MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join('logs', 'combined.log'),
      maxsize: 20 * 1024 * 1024, // 20 MB
      maxFiles: 10,
    })
  );
}

export const logger = winston.createLogger({
  // 'http' level captures Morgan access logs in production; 'debug' gets everything in dev
  level: env.NODE_ENV === 'production' ? 'http' : 'debug',
  format: env.NODE_ENV === 'production' ? prodFormat : devFormat,
  defaultMeta: { service: brand.shortName },
  transports,
  exceptionHandlers: [
    new winston.transports.Console(),
    ...(env.NODE_ENV === 'production'
      ? [new winston.transports.File({ filename: path.join('logs', 'exceptions.log') })]
      : []),
  ],
  rejectionHandlers: [
    new winston.transports.Console(),
    ...(env.NODE_ENV === 'production'
      ? [new winston.transports.File({ filename: path.join('logs', 'rejections.log') })]
      : []),
  ],
  exitOnError: false,
});

// ─── Structured log helpers ───────────────────────────────────────────────────
export const log = {
  request: (method: string, path: string, ms: number, status: number) =>
    logger.http({ msg: 'request', method, path, ms, status }),

  authFail: (reason: string, ip: string, userId?: string) =>
    logger.warn({ msg: 'auth_failure', reason, ip, userId }),

  authOk: (userId: string, ip: string) =>
    logger.info({ msg: 'auth_success', userId, ip }),

  dbError: (op: string, error: unknown) =>
    logger.error({ msg: 'db_error', op, error }),

  jobStart: (job: string) =>
    logger.info({ msg: 'job_start', job }),

  jobDone: (job: string, ms: number) =>
    logger.info({ msg: 'job_done', job, ms }),

  aiCall: (model: string, tokens: number, ms: number) =>
    logger.info({ msg: 'ai_call', model, tokens, ms }),

  security: (event: string, meta: Record<string, unknown>) =>
    logger.warn({ msg: 'security_event', event, ...meta }),
};
