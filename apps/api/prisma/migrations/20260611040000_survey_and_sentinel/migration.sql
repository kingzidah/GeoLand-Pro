-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "totalAreaHa" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "satellite_images" ADD COLUMN     "centerLat" DOUBLE PRECISION,
ADD COLUMN     "centerLng" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "survey_points" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "pointIndex" INTEGER NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "elevation" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "label" TEXT,
    "notes" TEXT,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_imports" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "importedById" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "plotsCreated" INTEGER NOT NULL,
    "plotIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "survey_points_propertyId_sessionId_idx" ON "survey_points"("propertyId", "sessionId");

-- CreateIndex
CREATE INDEX "survey_imports_propertyId_idx" ON "survey_imports"("propertyId");

-- AddForeignKey
ALTER TABLE "survey_points" ADD CONSTRAINT "survey_points_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_points" ADD CONSTRAINT "survey_points_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_imports" ADD CONSTRAINT "survey_imports_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_imports" ADD CONSTRAINT "survey_imports_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
