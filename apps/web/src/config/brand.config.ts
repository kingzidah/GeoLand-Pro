/**
 * BRAND CONFIGURATION (frontend mirror)
 * ─────────────────────────────────────────────
 * Mirrors apps/api/src/config/brand.config.ts. The app name is NOT
 * finalised — every UI string reads from here so a rename only touches
 * .env / VITE_APP_* values, never component code.
 * ─────────────────────────────────────────────
 */

export const brand = {
  name: (import.meta.env.VITE_APP_NAME as string | undefined) ?? 'GeoLand Pro',
  shortName: (import.meta.env.VITE_APP_NAME_SHORT as string | undefined) ?? 'GLP',
  tagline:
    (import.meta.env.VITE_APP_TAGLINE as string | undefined) ?? 'Protecting Land. Building Trust.',
} as const;

export type Brand = typeof brand;
