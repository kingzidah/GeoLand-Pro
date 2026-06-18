import { Role, LeaseStatus } from '@prisma/client';
import { ZipArchive, type ArchiverError } from 'archiver';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../config/database';
import { s3Service } from './s3.service';
import { documentService } from './document.service';
import { pdfService } from './pdf.service';
import { brand } from '../config/brand.config';
import { ApiError } from '../utils/ApiError';
import { logger } from '../config/logger';
import type { SubscribeVaultInput, RequestPhysicalVaultInput } from '../validations/vault.schema';

const PACK_DOWNLOAD_EXPIRES_SECONDS = 24 * 60 * 60; // 24 hours

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function assertPropertyAccess(propertyId: string, userId: string, role: Role, organisationId: string | null) {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      id: true,
      name: true,
      address: true,
      region: true,
      isActive: true,
      organisationId: true,
      organisation: { select: { name: true } },
      managers: { select: { id: true } },
    },
  });

  if (!property || !property.isActive) {
    throw ApiError.notFound('Property');
  }

  if (organisationId && property.organisationId !== organisationId) {
    throw ApiError.notFound('Property');
  }

  if (role !== Role.SUPER_ADMIN) {
    const isAssigned = property.managers.some((m) => m.id === userId);
    if (!isAssigned) throw ApiError.forbidden();
  }

  return property;
}

function buildZipBuffer(files: { name: string; buffer: Buffer }[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const chunks: Buffer[] = [];

    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('error', (err: ArchiverError) => reject(err));
    archive.on('end', () => resolve(Buffer.concat(chunks)));

    for (const file of files) {
      archive.append(file.buffer, { name: file.name });
    }

    void archive.finalize();
  });
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const vaultService = {
  async getStatus(propertyId: string, userId: string, role: Role, organisationId: string | null) {
    await assertPropertyAccess(propertyId, userId, role, organisationId);

    const subscription = await prisma.vaultSubscription.findUnique({
      where: { propertyId },
    });

    return {
      subscription,
      lastPackGenerated: subscription?.lastPackGenerated ?? null,
    };
  },

  async subscribe(propertyId: string, userId: string, role: Role, data: SubscribeVaultInput, organisationId: string | null) {
    await assertPropertyAccess(propertyId, userId, role, organisationId);

    const subscription = await prisma.vaultSubscription.upsert({
      where: { propertyId },
      create: {
        propertyId,
        physicalVault: data.physicalVault,
        deliveryAddress: data.deliveryAddress,
      },
      update: {
        physicalVault: data.physicalVault,
        deliveryAddress: data.deliveryAddress,
      },
    });

    logger.info('Vault subscription updated', { propertyId, physicalVault: data.physicalVault, userId });

    return subscription;
  },

  async generatePack(propertyId: string, userId: string, role: Role, organisationId: string | null) {
    const property = await assertPropertyAccess(propertyId, userId, role, organisationId);
    const year = new Date().getFullYear();

    const annualReport = await documentService.generateAnnualReport(propertyId, year, userId, role, organisationId);
    const annualReportBuffer = await s3Service.downloadBuffer(annualReport.s3Key);

    const plots = await prisma.plot.findMany({
      where: { propertyId },
      select: {
        id: true,
        plotNumber: true,
        leaseAgreements: {
          where: { status: LeaseStatus.ACTIVE },
          select: {
            status: true,
            monthlyRentGHS: true,
            arrearsGHS: true,
            tenant: { select: { user: { select: { firstName: true, lastName: true, phone: true } } } },
          },
          take: 1,
        },
      },
      orderBy: { plotNumber: 'asc' },
    });

    const files: { name: string; buffer: Buffer }[] = [
      { name: `annual-report-${year}.pdf`, buffer: annualReportBuffer },
    ];

    for (const plot of plots) {
      const boundaryCert = await documentService.generateBoundaryCertificate(plot.id, userId, role, organisationId);
      files.push({
        name: `boundary-certificates/${plot.plotNumber}.pdf`,
        buffer: await s3Service.downloadBuffer(boundaryCert.s3Key),
      });

      const plotCert = await documentService.generatePlotCertificate(plot.id, userId, role, organisationId);
      files.push({
        name: `plot-certificates/${plot.plotNumber}.pdf`,
        buffer: await s3Service.downloadBuffer(plotCert.s3Key),
      });
    }

    const tenantRows = plots.map((p) => {
      const lease = p.leaseAgreements[0];
      return {
        plotNumber: p.plotNumber,
        tenantName: lease ? `${lease.tenant.user.firstName} ${lease.tenant.user.lastName}` : null,
        phone: lease?.tenant.user.phone ?? null,
        leaseStatus: lease?.status ?? 'VACANT',
        monthlyRentGHS: lease?.monthlyRentGHS ?? null,
        arrearsGHS: lease?.arrearsGHS ?? 0,
      };
    });

    const tenantListBuffer = await pdfService.generateTenantList({
      documentId: uuidv4(),
      referenceNo: `${brand.shortName}-TENANTLIST-${Date.now()}`,
      property: { name: property.name, address: property.address, region: property.region },
      year,
      tenants: tenantRows,
      issueDate: new Date(),
    });
    files.push({ name: `tenant-list-${year}.pdf`, buffer: tenantListBuffer });

    const zipBuffer = await buildZipBuffer(files);
    const s3Key = `vault/${propertyId}/${year}/pack.zip`;
    await s3Service.uploadBuffer(s3Key, zipBuffer, 'application/zip');

    await prisma.vaultSubscription.upsert({
      where: { propertyId },
      create: { propertyId, lastPackGenerated: new Date() },
      update: { lastPackGenerated: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'VAULT_PACK_GENERATED',
        entityType: 'Property',
        entityId: propertyId,
        metadata: { propertyId, year, s3Key, fileCount: files.length },
      },
    });

    const downloadUrl = await s3Service.getPresignedDownloadUrl(s3Key, PACK_DOWNLOAD_EXPIRES_SECONDS);

    logger.info('Vault pack generated', { propertyId, year, s3Key, fileCount: files.length, generatedBy: userId });

    return { s3Key, downloadUrl, expiresIn: PACK_DOWNLOAD_EXPIRES_SECONDS, fileCount: files.length };
  },

  async requestPhysicalVault(
    propertyId: string,
    userId: string,
    role: Role,
    data: RequestPhysicalVaultInput,
    organisationId: string | null
  ) {
    const property = await assertPropertyAccess(propertyId, userId, role, organisationId);

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'PHYSICAL_VAULT_REQUESTED',
        entityType: 'Property',
        entityId: propertyId,
        metadata: {
          title: `Physical Vault Request — ${property.organisation.name}`,
          propertyId,
          propertyName: property.name,
          organisationName: property.organisation.name,
          name: data.name,
          deliveryAddress: data.deliveryAddress,
          contactNumber: data.contactNumber,
        },
      },
    });

    logger.info('Physical vault requested', { propertyId, requestedBy: userId });

    return { success: true };
  },

  async confirmDelivery(propertyId: string, userId: string, role: Role, organisationId: string | null) {
    await assertPropertyAccess(propertyId, userId, role, organisationId);

    const existing = await prisma.vaultSubscription.findUnique({ where: { propertyId } });
    if (!existing) throw ApiError.notFound('Vault subscription');

    const subscription = await prisma.vaultSubscription.update({
      where: { propertyId },
      data: { lastDeliveryConfirmed: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'VAULT_DELIVERY_CONFIRMED',
        entityType: 'Property',
        entityId: propertyId,
        metadata: { propertyId, confirmedAt: subscription.lastDeliveryConfirmed },
      },
    });

    logger.info('Vault delivery confirmed', { propertyId, confirmedBy: userId });

    return subscription;
  },
};
