-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'FIELD_SURVEYOR', 'TENANT');

-- CreateEnum
CREATE TYPE "PlotStatus" AS ENUM ('VACANT', 'OCCUPIED', 'DISPUTED', 'RESERVED', 'UNDER_SURVEY');

-- CreateEnum
CREATE TYPE "LeaseStatus" AS ENUM ('PENDING_SIGNATURE', 'ACTIVE', 'EXPIRED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('RENT_PAYMENT', 'ARREARS_PAYMENT', 'DEPOSIT', 'REFUND');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('BOUNDARY_CERTIFICATE', 'TENANCY_AGREEMENT', 'RENT_RECEIPT', 'ARREARS_NOTICE');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('SMS', 'WHATSAPP', 'EMAIL');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "AlertEventType" AS ENUM ('BOUNDARY_CROSSED', 'BOUNDARY_EXITED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "refreshTokenHash" TEXT,
    "passwordResetToken" TEXT,
    "passwordResetExpiry" TIMESTAMP(3),
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "totalAreaSqm" DOUBLE PRECISION NOT NULL,
    "boundaryGeoJSON" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plots" (
    "id" TEXT NOT NULL,
    "plotNumber" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "status" "PlotStatus" NOT NULL DEFAULT 'VACANT',
    "areaSqm" DOUBLE PRECISION NOT NULL,
    "centroidLat" DOUBLE PRECISION,
    "centroidLng" DOUBLE PRECISION,
    "boundaryGeoJSON" JSONB NOT NULL,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nationalIdType" TEXT NOT NULL,
    "nationalIdNumber" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "occupation" TEXT,
    "emergencyContact" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lease_agreements" (
    "id" TEXT NOT NULL,
    "leaseNumber" TEXT NOT NULL,
    "plotId" TEXT NOT NULL,
    "tenantProfileId" TEXT NOT NULL,
    "status" "LeaseStatus" NOT NULL DEFAULT 'PENDING_SIGNATURE',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "monthlyRentGHS" DOUBLE PRECISION NOT NULL,
    "depositAmountGHS" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "plotCentroidLat" DOUBLE PRECISION NOT NULL,
    "plotCentroidLng" DOUBLE PRECISION NOT NULL,
    "plotBoundaryGeoJSON" JSONB NOT NULL,
    "tenantSignatureUrl" TEXT,
    "adminSignatureUrl" TEXT,
    "signedAt" TIMESTAMP(3),
    "totalPaidGHS" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "arrearsGHS" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastPaymentDate" TIMESTAMP(3),
    "notes" TEXT,
    "terminatedAt" TIMESTAMP(3),
    "terminationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lease_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rent_records" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amountDueGHS" DOUBLE PRECISION NOT NULL,
    "amountPaidGHS" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "isArrears" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "rentRecordId" TEXT,
    "leaseId" TEXT,
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "amountGHS" DOUBLE PRECISION NOT NULL,
    "paymentMethod" TEXT,
    "paymentReference" TEXT,
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commissions" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "ratePercent" DOUBLE PRECISION NOT NULL DEFAULT 4.0,
    "amountGHS" DOUBLE PRECISION NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "s3Url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "sizeBytes" INTEGER,
    "plotId" TEXT,
    "leaseId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geofence_alerts" (
    "id" TEXT NOT NULL,
    "plotId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bufferMetres" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "boundaryGeoJSON" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notifyPhones" TEXT[],
    "notifyViaWhatsApp" BOOLEAN NOT NULL DEFAULT true,
    "notifyViaSMS" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "geofence_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_events" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "eventType" "AlertEventType" NOT NULL,
    "triggeredLat" DOUBLE PRECISION NOT NULL,
    "triggeredLng" DOUBLE PRECISION NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceId" TEXT,
    "notified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "alert_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geotagged_photos" (
    "id" TEXT NOT NULL,
    "plotId" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "s3Url" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "altitude" DOUBLE PRECISION,
    "accuracyM" DOUBLE PRECISION,
    "takenAt" TIMESTAMP(3) NOT NULL,
    "caption" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "geotagged_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "leaseId" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "externalId" TEXT,
    "sentAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PropertyManagers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "plots_propertyId_idx" ON "plots"("propertyId");

-- CreateIndex
CREATE INDEX "plots_status_idx" ON "plots"("status");

-- CreateIndex
CREATE UNIQUE INDEX "plots_propertyId_plotNumber_key" ON "plots"("propertyId", "plotNumber");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_profiles_userId_key" ON "tenant_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_profiles_nationalIdNumber_key" ON "tenant_profiles"("nationalIdNumber");

-- CreateIndex
CREATE UNIQUE INDEX "lease_agreements_leaseNumber_key" ON "lease_agreements"("leaseNumber");

-- CreateIndex
CREATE INDEX "lease_agreements_plotId_idx" ON "lease_agreements"("plotId");

-- CreateIndex
CREATE INDEX "lease_agreements_tenantProfileId_idx" ON "lease_agreements"("tenantProfileId");

-- CreateIndex
CREATE INDEX "lease_agreements_status_idx" ON "lease_agreements"("status");

-- CreateIndex
CREATE INDEX "rent_records_leaseId_idx" ON "rent_records"("leaseId");

-- CreateIndex
CREATE INDEX "rent_records_isPaid_idx" ON "rent_records"("isPaid");

-- CreateIndex
CREATE UNIQUE INDEX "rent_records_leaseId_periodYear_periodMonth_key" ON "rent_records"("leaseId", "periodYear", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_rentRecordId_key" ON "transactions"("rentRecordId");

-- CreateIndex
CREATE INDEX "transactions_leaseId_idx" ON "transactions"("leaseId");

-- CreateIndex
CREATE UNIQUE INDEX "commissions_transactionId_key" ON "commissions"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "documents_s3Key_key" ON "documents"("s3Key");

-- CreateIndex
CREATE INDEX "documents_plotId_idx" ON "documents"("plotId");

-- CreateIndex
CREATE INDEX "documents_leaseId_idx" ON "documents"("leaseId");

-- CreateIndex
CREATE INDEX "alert_events_alertId_idx" ON "alert_events"("alertId");

-- CreateIndex
CREATE UNIQUE INDEX "geotagged_photos_s3Key_key" ON "geotagged_photos"("s3Key");

-- CreateIndex
CREATE INDEX "geotagged_photos_plotId_idx" ON "geotagged_photos"("plotId");

-- CreateIndex
CREATE INDEX "notifications_status_idx" ON "notifications"("status");

-- CreateIndex
CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "_PropertyManagers_AB_unique" ON "_PropertyManagers"("A", "B");

-- CreateIndex
CREATE INDEX "_PropertyManagers_B_index" ON "_PropertyManagers"("B");

-- AddForeignKey
ALTER TABLE "plots" ADD CONSTRAINT "plots_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plots" ADD CONSTRAINT "plots_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_profiles" ADD CONSTRAINT "tenant_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease_agreements" ADD CONSTRAINT "lease_agreements_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "plots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease_agreements" ADD CONSTRAINT "lease_agreements_tenantProfileId_fkey" FOREIGN KEY ("tenantProfileId") REFERENCES "tenant_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_records" ADD CONSTRAINT "rent_records_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "lease_agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_rentRecordId_fkey" FOREIGN KEY ("rentRecordId") REFERENCES "rent_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "plots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "lease_agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geofence_alerts" ADD CONSTRAINT "geofence_alerts_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "plots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geofence_alerts" ADD CONSTRAINT "geofence_alerts_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "geofence_alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geotagged_photos" ADD CONSTRAINT "geotagged_photos_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "plots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "lease_agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PropertyManagers" ADD CONSTRAINT "_PropertyManagers_A_fkey" FOREIGN KEY ("A") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PropertyManagers" ADD CONSTRAINT "_PropertyManagers_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

