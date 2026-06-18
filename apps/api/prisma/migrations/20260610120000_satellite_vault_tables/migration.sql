-- AlterEnum
ALTER TYPE "AlertEventType" ADD VALUE 'SATELLITE_CHANGE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentType" ADD VALUE 'PLOT_CERTIFICATE';
ALTER TYPE "DocumentType" ADD VALUE 'LC_SUBMISSION_PACKAGE';
ALTER TYPE "DocumentType" ADD VALUE 'ANNUAL_REPORT';

-- CreateTable
CREATE TABLE "satellite_images" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "provider" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "resolution" DOUBLE PRECISION NOT NULL,
    "imageUrl" TEXT,
    "thumbnailUrl" TEXT,
    "cloudCover" DOUBLE PRECISION,
    "ndvi" DOUBLE PRECISION,
    "changeScore" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "satellite_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vault_subscriptions" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "digitalBackup" BOOLEAN NOT NULL DEFAULT true,
    "physicalVault" BOOLEAN NOT NULL DEFAULT false,
    "lastPackGenerated" TIMESTAMP(3),
    "lastDeliveryConfirmed" TIMESTAMP(3),
    "deliveryAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vault_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "satellite_images_propertyId_capturedAt_idx" ON "satellite_images"("propertyId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "vault_subscriptions_propertyId_key" ON "vault_subscriptions"("propertyId");

-- AddForeignKey
ALTER TABLE "satellite_images" ADD CONSTRAINT "satellite_images_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_subscriptions" ADD CONSTRAINT "vault_subscriptions_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
