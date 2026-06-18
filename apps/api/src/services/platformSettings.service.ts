import { prisma } from '../config/database';
import type { UpdatePlatformSettingsInput } from '../validations/organisation.schema';

// Master Control — Module 7 Platform Settings.
// Settings are stored as PlatformSetting key/value rows; this service is the
// single place that knows the keys, their value encoding, and fallbacks.

const DEFAULT_COMMISSION_RATE_KEY = 'default_commission_rate';
const MAINTENANCE_MODE_KEY = 'maintenance_mode';

export const FALLBACK_DEFAULT_COMMISSION_RATE = 0.1;

export const platformSettingsService = {
  async getSettings() {
    const rows = await prisma.platformSetting.findMany({
      where: { key: { in: [DEFAULT_COMMISSION_RATE_KEY, MAINTENANCE_MODE_KEY] } },
    });
    const byKey = new Map(rows.map((row) => [row.key, row]));

    const defaultCommissionRateRow = byKey.get(DEFAULT_COMMISSION_RATE_KEY);
    const maintenanceModeRow = byKey.get(MAINTENANCE_MODE_KEY);

    return {
      defaultCommissionRate: defaultCommissionRateRow
        ? Number(defaultCommissionRateRow.value)
        : FALLBACK_DEFAULT_COMMISSION_RATE,
      maintenanceMode: maintenanceModeRow?.value === 'true',
      updatedAt: rows.reduce<Date | null>(
        (latest, row) => (!latest || row.updatedAt > latest ? row.updatedAt : latest),
        null
      ),
    };
  },

  /** Used by organisation creation to seed `commissionRate` when not explicitly provided. */
  async getDefaultCommissionRate(): Promise<number> {
    const row = await prisma.platformSetting.findUnique({ where: { key: DEFAULT_COMMISSION_RATE_KEY } });
    return row ? Number(row.value) : FALLBACK_DEFAULT_COMMISSION_RATE;
  },

  /** Used by the login flow to block non-platform-admin sign-ins during maintenance. */
  async isMaintenanceModeEnabled(): Promise<boolean> {
    const row = await prisma.platformSetting.findUnique({ where: { key: MAINTENANCE_MODE_KEY } });
    return row?.value === 'true';
  },

  async updateSettings(data: UpdatePlatformSettingsInput, updatedBy: string) {
    await prisma.$transaction(async (tx) => {
      if (data.defaultCommissionRate !== undefined) {
        await tx.platformSetting.upsert({
          where: { key: DEFAULT_COMMISSION_RATE_KEY },
          update: { value: String(data.defaultCommissionRate), updatedBy },
          create: { key: DEFAULT_COMMISSION_RATE_KEY, value: String(data.defaultCommissionRate), updatedBy },
        });
      }
      if (data.maintenanceMode !== undefined) {
        await tx.platformSetting.upsert({
          where: { key: MAINTENANCE_MODE_KEY },
          update: { value: String(data.maintenanceMode), updatedBy },
          create: { key: MAINTENANCE_MODE_KEY, value: String(data.maintenanceMode), updatedBy },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: updatedBy,
          action: 'PLATFORM_SETTINGS_UPDATED',
          entityType: 'PlatformSetting',
          entityId: 'platform',
          metadata: { ...data },
        },
      });
    });

    return this.getSettings();
  },
};
