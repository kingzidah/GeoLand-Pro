import { defineConfig } from '@playwright/test';

/**
 * E2E config for the consent-gated impersonation loop (Phase 4).
 *
 * Prerequisites (this config does not start anything for you):
 *   1. apps/api dev server running on http://localhost:4000
 *   2. apps/web dev server running on http://localhost:5173 (`npm run dev`)
 *   3. Database seeded from apps/api:
 *        npm run prisma:seed
 *        npm run prisma:seed:test-roles
 *
 * Run with: npm run test:e2e (from apps/web)
 *
 * Single worker / no parallelism: the spec drives one seeded access request
 * through its full lifecycle and asserts on shared DB state at each step.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
});
