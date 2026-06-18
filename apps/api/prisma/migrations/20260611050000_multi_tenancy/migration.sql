-- CreateTable: organisations
CREATE TABLE "organisations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Ghana',
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Accra',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "subscriptionTier" TEXT NOT NULL DEFAULT 'STANDARD',
    "commissionRate" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
    "maxProperties" INTEGER NOT NULL DEFAULT 10,
    "maxUsers" INTEGER NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organisations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organisations_slug_key" ON "organisations"("slug");

-- CreateTable: invite_codes
CREATE TABLE "invite_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdBy" TEXT NOT NULL,
    "usedBy" TEXT,
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invite_codes_code_key" ON "invite_codes"("code");
CREATE INDEX "invite_codes_organisationId_idx" ON "invite_codes"("organisationId");

ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: users — platform admin flag + optional organisation membership
ALTER TABLE "users" ADD COLUMN "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "organisationId" TEXT;

CREATE INDEX "users_organisationId_idx" ON "users"("organisationId");

ALTER TABLE "users" ADD CONSTRAINT "users_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: properties — add organisationId nullable first so existing rows can be backfilled
ALTER TABLE "properties" ADD COLUMN "organisationId" TEXT;

-- Seed the two baseline organisations referenced by prisma/seed.ts
INSERT INTO "organisations" ("id", "name", "slug", "country", "currency", "timezone", "isActive", "subscriptionTier", "commissionRate", "maxProperties", "maxUsers", "createdAt", "updatedAt")
VALUES
  ('org_geolandpro_platform', 'GeoLand Pro Platform', 'geolandpro-platform', 'Ghana', 'GHS', 'Africa/Accra', true, 'ENTERPRISE', 0, 9999, 9999, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('org_accra_residential', 'Accra Residential Estate', 'accra-residential', 'Ghana', 'GHS', 'Africa/Accra', true, 'STANDARD', 0.10, 10, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

-- Backfill existing properties: Karlsruhe simulation stays under the platform org, everything else under Accra Residential
UPDATE "properties" SET "organisationId" = 'org_geolandpro_platform' WHERE "name" ILIKE '%Karlsruhe%';
UPDATE "properties" SET "organisationId" = 'org_accra_residential' WHERE "organisationId" IS NULL;

-- Enforce NOT NULL + index + FK now that every row has a value
ALTER TABLE "properties" ALTER COLUMN "organisationId" SET NOT NULL;
CREATE INDEX "properties_organisationId_idx" ON "properties"("organisationId");
ALTER TABLE "properties" ADD CONSTRAINT "properties_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
