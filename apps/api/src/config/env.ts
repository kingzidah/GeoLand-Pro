import { z } from 'zod';

const envSchema = z.object({
  // ─── App ──────────────────────────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),

  // ─── Database ─────────────────────────────────────────────────────────────
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection string'),

  // ─── Redis ────────────────────────────────────────────────────────────────
  REDIS_URL: z.string().url('REDIS_URL must be a valid Redis connection string'),

  // ─── JWT ──────────────────────────────────────────────────────────────────
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // ─── Encryption ──────────────────────────────────────────────────────────
  // 32-byte AES-256 key encoded as 64 hex characters. Validated here so any
  // environment (dev, staging, production) fails at startup with a clear
  // message instead of at the first encryption call with a cryptic error.
  // Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ENCRYPTION_KEY: z.string().regex(
    /^[0-9a-f]{64}$/i,
    'ENCRYPTION_KEY must be a 64-character hex string (32 bytes)'
  ),

  // ─── AWS S3 ───────────────────────────────────────────────────────────────
  AWS_REGION: z.string(),
  AWS_ACCESS_KEY_ID: z.string(),
  AWS_SECRET_ACCESS_KEY: z.string(),
  AWS_S3_BUCKET: z.string(),

  // ─── Twilio ───────────────────────────────────────────────────────────────
  TWILIO_ACCOUNT_SID: z.string().startsWith('AC', 'TWILIO_ACCOUNT_SID must start with AC'),
  TWILIO_AUTH_TOKEN: z.string(),
  TWILIO_PHONE_NUMBER: z.string(),
  TWILIO_WHATSAPP_NUMBER: z.string(),

  // ─── CORS ─────────────────────────────────────────────────────────────────
  // Stored as comma-separated string in .env, parsed into an array here
  CORS_ORIGINS: z
    .string()
    .transform((val) => val.split(',').map((o) => o.trim()).filter(Boolean)),

  // ─── Platform ─────────────────────────────────────────────────────────────
  COMMISSION_RATE_PERCENT: z.coerce.number().min(0).max(100).default(4),
  WEB_APP_URL: z.string().url().default('http://localhost:5173'),

  // ─── AI (OpenRouter) ──────────────────────────────────────────────────────
  OPENROUTER_API_KEY: z.string().min(1, 'OPENROUTER_API_KEY is required'),
  OPENROUTER_MODEL: z.string().default('anthropic/claude-sonnet-4-5'),

  // ─── Email (Resend) ───────────────────────────────────────────────────────
  // Optional in development — when absent, email delivery falls back to the
  // NoOp provider which logs the payload. Required in production (enforced by
  // env.validation.ts). EMAIL_FROM format: "Display Name <addr@domain.com>".
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  // ─── Satellite (Google Earth Engine) ─────────────────────────────────────
  // Optional — when absent, the satellite fetch job logs "pending API key"
  // and skips actual imagery requests until this is configured.
  GOOGLE_EARTH_ENGINE_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('\n❌  Missing or invalid environment variables:\n');
  Object.entries(parsed.error.flatten().fieldErrors).forEach(([key, messages]) => {
    console.error(`  ${key}: ${(messages as string[]).join(', ')}`);
  });
  console.error('\nCopy .env.example → .env and fill in all required values.\n');
  process.exit(1);
}

export const env = parsed.data;

export type Env = typeof env;
