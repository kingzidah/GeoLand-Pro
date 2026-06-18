/**
 * Production environment validation.
 *
 * Runs as a side effect on import — must be imported first (right after
 * `dotenv/config`) in server.ts, before any other module establishes a
 * database/Redis connection or reads process.env with an insecure fallback.
 *
 * In non-production environments this is a no-op so local development can
 * keep using the default/fallback values defined elsewhere in the codebase.
 */

const REQUIRED_IN_PRODUCTION = [
  'DATABASE_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'ENCRYPTION_KEY',
  'HASH_SALT',
  'OTP_SALT',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_WHATSAPP_NUMBER',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_S3_BUCKET',
  'OPENROUTER_API_KEY',
  'ALLOWED_ORIGINS',
  'RESEND_API_KEY',
  'EMAIL_FROM',
] as const;

const OPTIONAL_WITH_WARNING = [
  'GOOGLE_EARTH_ENGINE_KEY',
  'SENTRY_DSN',
  'PLANET_LABS_API_KEY',
] as const;

export function validateEnv(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const missing = REQUIRED_IN_PRODUCTION.filter((key) => !process.env[key]?.trim());

  if (missing.length > 0) {
    console.error('\n❌  Missing required production environment variables:\n');
    missing.forEach((key) => console.error(`  - ${key}`));
    console.error('\nSet these variables before starting the server.\n');
    process.exit(1);
  }

  OPTIONAL_WITH_WARNING.forEach((key) => {
    if (!process.env[key]?.trim()) {
      console.warn(`⚠️  Optional environment variable ${key} is not set — related features will be disabled.`);
    }
  });
}

validateEnv();
