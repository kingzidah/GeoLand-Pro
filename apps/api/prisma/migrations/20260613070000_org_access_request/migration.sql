-- CreateEnum
CREATE TYPE "AccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'ACTIVE', 'EXPIRED', 'REVOKED', 'ENDED');

-- CreateTable
CREATE TABLE "org_access_requests" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reason" TEXT,
    "requestedScopes" TEXT[],
    "grantedScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" "AccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "org_access_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "org_access_requests_organisationId_idx" ON "org_access_requests"("organisationId");

-- CreateIndex
CREATE INDEX "org_access_requests_requestedById_idx" ON "org_access_requests"("requestedById");

-- CreateIndex
CREATE INDEX "org_access_requests_status_idx" ON "org_access_requests"("status");

-- AddForeignKey
ALTER TABLE "org_access_requests" ADD CONSTRAINT "org_access_requests_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
