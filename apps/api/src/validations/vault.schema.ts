import { z } from 'zod';

export const vaultPropertyIdParamSchema = z.object({
  propertyId: z.string().cuid({ message: 'Invalid property ID' }),
});

export const subscribeVaultSchema = z.object({
  physicalVault: z.boolean(),
  deliveryAddress: z.string().min(1).max(500).trim().optional(),
});

export const requestPhysicalVaultSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  deliveryAddress: z.string().min(1).max(500).trim(),
  contactNumber: z.string().min(1).max(50).trim(),
});

// ─── Exported types ───────────────────────────────────────────────────────────

export type VaultPropertyIdParam = z.infer<typeof vaultPropertyIdParamSchema>;
export type SubscribeVaultInput = z.infer<typeof subscribeVaultSchema>;
export type RequestPhysicalVaultInput = z.infer<typeof requestPhysicalVaultSchema>;
