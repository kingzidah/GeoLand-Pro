/**
 * BRAND CONFIGURATION
 * ─────────────────────────────────────────────
 * The app name is NOT finalised. Every part of
 * the platform reads from here. When the name
 * is decided, update .env only. Nothing else
 * changes — PDFs, emails, WhatsApp messages,
 * UI, API responses all update automatically.
 * ─────────────────────────────────────────────
 */

export const brand = {
  name:         process.env.APP_NAME          ?? 'GeoLand Pro',
  shortName:    process.env.APP_NAME_SHORT     ?? 'GLP',
  tagline:      process.env.APP_TAGLINE        ?? 'Protecting Land. Building Trust.',
  domain:       process.env.APP_DOMAIN         ?? 'localhost',
  supportEmail: process.env.APP_SUPPORT_EMAIL  ?? 'support@app.local',
  companyName:  process.env.APP_COMPANY_NAME   ?? 'GeoLand Pro Ghana Limited',
  address:      process.env.APP_ADDRESS        ?? 'Accra, Ghana',
  phone:        process.env.APP_PHONE          ?? '',
  logoUrl:      process.env.APP_LOGO_URL       ?? '',

  // Document watermark text
  get watermark() { return `© ${new Date().getFullYear()} ${this.companyName}`; },

  // Email subjects
  email: {
    get rentReminder()  { return `[${brand.shortName}] Rent Payment Reminder`; },
    get arrearNotice()  { return `[${brand.shortName}] Outstanding Rent Notice`; },
    get welcomeTenant() { return `Welcome to ${brand.name} Tenant Portal`; },
    get otpSubject()    { return `${brand.name} — Verification Code`; },
    get alertSubject()  { return `[${brand.shortName}] Property Alert`; },
  },

  // WhatsApp message prefixes
  get whatsappPrefix() { return `*${this.name}*\n`; },
};

export type Brand = typeof brand;
