// Loaded via `--require` before any test file. apps/api/src/config/env.ts
// validates process.env at import time and calls process.exit(1) if any
// required var is missing — fine for the running server (which loads a real
// .env), but fatal for unit tests that transitively import a config module
// (e.g. ../config/logger, ../config/redis) purely for its exports. These are
// dummy values: never used for real I/O, only to satisfy envSchema so module
// graphs load. Existing values (e.g. from a real .env) are left untouched.
const dummyValues = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'test-jwt-access-secret-xxxxxxxxxxxxxxxxxxxx',
  JWT_REFRESH_SECRET: 'test-jwt-refresh-secret-xxxxxxxxxxxxxxxxxxx',
  AWS_REGION: 'us-east-1',
  AWS_ACCESS_KEY_ID: 'test',
  AWS_SECRET_ACCESS_KEY: 'test',
  AWS_S3_BUCKET: 'test-bucket',
  TWILIO_ACCOUNT_SID: 'ACtestxxxxxxxxxxxxxxxxxxxxxxxxxx',
  TWILIO_AUTH_TOKEN: 'test',
  TWILIO_PHONE_NUMBER: '+10000000000',
  TWILIO_WHATSAPP_NUMBER: '+10000000000',
  CORS_ORIGINS: 'http://localhost:5173',
  OPENROUTER_API_KEY: 'test',
};

for (const [key, value] of Object.entries(dummyValues)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}
