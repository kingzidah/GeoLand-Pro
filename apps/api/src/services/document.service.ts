import { Role, DocumentType, PlotStatus, LeaseStatus, TransactionStatus, Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../config/database';
import { s3Service } from './s3.service';
import { pdfService } from './pdf.service';
import { brand } from '../config/brand.config';
import { ApiError } from '../utils/ApiError';
import { logger } from '../config/logger';
import type {
  PresignedUploadInput,
  ConfirmUploadInput,
  ListDocumentsQuery,
} from '../validations/document.schema';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const documentSelect = {
  id: true,
  type: true,
  title: true,
  s3Key: true,
  s3Url: true,
  mimeType: true,
  sizeBytes: true,
  plotId: true,
  leaseId: true,
  createdAt: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  plot: { select: { id: true, plotNumber: true, propertyId: true } },
  lease: { select: { id: true, leaseNumber: true } },
} as const;

function buildDocumentWhereForRole(
  userId: string,
  role: Role,
  organisationId: string | null,
  tenantProfileId?: string
): Prisma.DocumentWhereInput {
  const conditions: Prisma.DocumentWhereInput[] = [];

  if (organisationId) {
    conditions.push({
      OR: [
        { plot: { property: { organisationId } } },
        { lease: { plot: { property: { organisationId } } } },
      ],
    });
  }

  if (role === Role.SUPER_ADMIN) {
    return conditions.length > 0 ? { AND: conditions } : {};
  }

  if (role === Role.TENANT && tenantProfileId) {
    conditions.push({ lease: { tenantProfileId } });
    return { AND: conditions };
  }

  // FIELD_SURVEYOR, MANAGER, ADMIN — scoped to managed properties
  conditions.push({
    OR: [
      { plot: { property: { managers: { some: { id: userId } } } } },
      { lease: { plot: { property: { managers: { some: { id: userId } } } } } },
    ],
  });

  return { AND: conditions };
}

async function resolveAccessFilter(userId: string, role: Role, organisationId: string | null) {
  if (role === Role.TENANT) {
    const profile = await prisma.tenantProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    return buildDocumentWhereForRole(userId, role, organisationId, profile?.id);
  }
  return buildDocumentWhereForRole(userId, role, organisationId);
}

async function assertDocumentAccess(
  doc: {
    plotId: string | null;
    leaseId: string | null;
    createdBy: { id: string };
    plot: { propertyId: string } | null;
  },
  userId: string,
  role: Role,
  organisationId: string | null
) {
  // Resolve the property this document belongs to (if any)
  let propertyId: string | null = doc.plot?.propertyId ?? null;
  if (!propertyId && doc.leaseId) {
    const lease = await prisma.leaseAgreement.findUnique({
      where: { id: doc.leaseId },
      select: { plot: { select: { propertyId: true } } },
    });
    propertyId = lease?.plot.propertyId ?? null;
  }

  if (organisationId && propertyId) {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { organisationId: true },
    });
    if (property?.organisationId !== organisationId) throw ApiError.notFound('Document');
  }

  if (role === Role.SUPER_ADMIN) return;

  if (role === Role.TENANT) {
    if (!doc.leaseId) throw ApiError.forbidden();
    const lease = await prisma.leaseAgreement.findUnique({
      where: { id: doc.leaseId },
      select: { tenant: { select: { userId: true } } },
    });
    if (lease?.tenant.userId !== userId) throw ApiError.forbidden();
    return;
  }

  if (!propertyId) {
    // Document not linked to any property — only creator or ADMIN+ can access
    if (role === Role.FIELD_SURVEYOR && doc.createdBy.id !== userId) throw ApiError.forbidden();
    return;
  }

  // FIELD_SURVEYOR / MANAGER / ADMIN — must manage the related property
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { managers: { select: { id: true } } },
  });

  if (!property?.managers.some((m) => m.id === userId)) throw ApiError.forbidden();
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const documentService = {
  async list(userId: string, role: Role, query: ListDocumentsQuery, organisationId: string | null) {
    const skip = (query.page - 1) * query.limit;
    const accessFilter = await resolveAccessFilter(userId, role, organisationId);

    const where: Prisma.DocumentWhereInput = {
      ...accessFilter,
      ...(query.plotId && { plotId: query.plotId }),
      ...(query.leaseId && { leaseId: query.leaseId }),
      ...(query.type && { type: query.type }),
    };

    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where,
        select: documentSelect,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.document.count({ where }),
    ]);

    return {
      data: documents,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },

  async getById(documentId: string, userId: string, role: Role, organisationId: string | null) {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: documentSelect,
    });

    if (!doc) throw ApiError.notFound('Document');
    await assertDocumentAccess(doc, userId, role, organisationId);
    return doc;
  },

  async getPresignedUploadUrl(userId: string, _role: Role, data: PresignedUploadInput) {
    const folder = `documents/${data.type.toLowerCase()}`;
    const s3Key = s3Service.buildKey(folder, data.mimeType);
    const uploadUrl = await s3Service.getPresignedUploadUrl(s3Key, data.mimeType);

    return {
      s3Key,
      uploadUrl,
      expiresIn: s3Service.getUploadExpiresIn(),
    };
  },

  async confirmUpload(userId: string, _role: Role, data: ConfirmUploadInput, organisationId: string | null) {
    // Prevent duplicate s3Key registrations
    const existing = await prisma.document.findUnique({ where: { s3Key: data.s3Key } });
    if (existing) throw ApiError.conflict('This file has already been registered');

    if (organisationId && data.plotId) {
      const plot = await prisma.plot.findUnique({
        where: { id: data.plotId },
        select: { property: { select: { organisationId: true } } },
      });
      if (!plot || plot.property.organisationId !== organisationId) throw ApiError.notFound('Plot');
    }

    if (organisationId && data.leaseId) {
      const lease = await prisma.leaseAgreement.findUnique({
        where: { id: data.leaseId },
        select: { plot: { select: { property: { select: { organisationId: true } } } } },
      });
      if (!lease || lease.plot.property.organisationId !== organisationId) throw ApiError.notFound('Lease');
    }

    const s3Url = s3Service.buildPublicUrl(data.s3Key);

    const document = await prisma.document.create({
      data: {
        s3Key: data.s3Key,
        s3Url,
        title: data.title,
        type: data.type,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes ?? null,
        plotId: data.plotId ?? null,
        leaseId: data.leaseId ?? null,
        createdById: userId,
      },
      select: documentSelect,
    });

    logger.info('Document registered', { documentId: document.id, type: data.type });
    return document;
  },

  async getDownloadUrl(documentId: string, userId: string, role: Role, organisationId: string | null) {
    const doc = await this.getById(documentId, userId, role, organisationId);
    const downloadUrl = await s3Service.getPresignedDownloadUrl(doc.s3Key);
    return { downloadUrl, expiresIn: 900 };
  },

  async delete(documentId: string, userId: string, role: Role, organisationId: string | null) {
    const doc = await this.getById(documentId, userId, role, organisationId);
    await s3Service.deleteFile(doc.s3Key);
    await prisma.document.delete({ where: { id: documentId } });
    logger.info('Document deleted', { documentId, s3Key: doc.s3Key, deletedBy: userId });
  },

  async generateLeaseDoc(leaseId: string, userId: string, role: Role, organisationId: string | null) {
    const lease = await prisma.leaseAgreement.findUnique({
      where: { id: leaseId },
      select: {
        id: true,
        leaseNumber: true,
        status: true,
        startDate: true,
        endDate: true,
        monthlyRentGHS: true,
        depositAmountGHS: true,
        plotCentroidLat: true,
        plotCentroidLng: true,
        notes: true,
        tenantSignatureUrl: true,
        adminSignatureUrl: true,
        signedAt: true,
        plot: {
          select: {
            plotNumber: true,
            areaSqm: true,
            propertyId: true,
            property: {
              select: {
                name: true,
                address: true,
                region: true,
                organisationId: true,
                managers: { select: { id: true } },
              },
            },
          },
        },
        tenant: {
          select: {
            user: { select: { firstName: true, lastName: true, email: true, phone: true } },
          },
        },
      },
    });

    if (!lease) throw ApiError.notFound('Lease');

    if (organisationId && lease.plot.property.organisationId !== organisationId) {
      throw ApiError.notFound('Lease');
    }

    if (role !== Role.SUPER_ADMIN) {
      const isAssigned = lease.plot.property.managers.some((m) => m.id === userId);
      if (!isAssigned) throw ApiError.forbidden();
    }

    const pdfBuffer = await pdfService.generateLeaseAgreement(lease);

    const s3Key = s3Service.buildKey(`documents/lease/${leaseId}`, 'application/pdf');
    const s3Url = await s3Service.uploadBuffer(s3Key, pdfBuffer, 'application/pdf');

    const document = await prisma.document.create({
      data: {
        s3Key,
        s3Url,
        title: `Tenancy Agreement — ${lease.leaseNumber}`,
        type: DocumentType.TENANCY_AGREEMENT,
        mimeType: 'application/pdf',
        sizeBytes: pdfBuffer.length,
        leaseId,
        createdById: userId,
      },
      select: documentSelect,
    });

    logger.info('Lease document generated', {
      documentId: document.id,
      leaseId,
      generatedBy: userId,
    });

    return document;
  },

  async generateReceiptDoc(transactionId: string, userId: string, role: Role, organisationId: string | null) {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      select: {
        id: true,
        leaseId: true,
        type: true,
        amountGHS: true,
        paymentMethod: true,
        paymentReference: true,
        paidAt: true,
        notes: true,
      },
    });

    if (!transaction) throw ApiError.notFound('Transaction');

    // Org + access check — must belong to the org and manage the property the lease belongs to
    if (transaction.leaseId) {
      const lease = await prisma.leaseAgreement.findUnique({
        where: { id: transaction.leaseId },
        select: {
          plot: {
            select: {
              property: { select: { organisationId: true, managers: { select: { id: true } } } },
            },
          },
        },
      });

      if (organisationId && lease?.plot.property.organisationId !== organisationId) {
        throw ApiError.notFound('Transaction');
      }

      if (role !== Role.SUPER_ADMIN) {
        const isAssigned = lease?.plot.property.managers.some((m) => m.id === userId);
        if (!isAssigned) throw ApiError.forbidden();
      }
    }

    // Fetch lease context for the receipt (if linked)
    let leaseContext = null;
    if (transaction.leaseId) {
      leaseContext = await prisma.leaseAgreement.findUnique({
        where: { id: transaction.leaseId },
        select: {
          leaseNumber: true,
          plot: { select: { plotNumber: true, property: { select: { name: true, address: true } } } },
          tenant: { select: { user: { select: { firstName: true, lastName: true, email: true } } } },
          rentRecords: {
            where: { paidAt: { gte: transaction.paidAt ?? new Date(0) } },
            select: { periodYear: true, periodMonth: true, amountDueGHS: true },
            take: 1,
          },
        },
      });
    }

    const receiptData = { ...transaction, lease: leaseContext };
    const pdfBuffer = await pdfService.generateRentReceipt(receiptData);

    const s3Key = s3Service.buildKey(`documents/receipts`, 'application/pdf');
    const s3Url = await s3Service.uploadBuffer(s3Key, pdfBuffer, 'application/pdf');

    const document = await prisma.document.create({
      data: {
        s3Key,
        s3Url,
        title: `Rent Receipt — ${new Date(transaction.paidAt ?? new Date()).toLocaleDateString('en-GB')}`,
        type: DocumentType.RENT_RECEIPT,
        mimeType: 'application/pdf',
        sizeBytes: pdfBuffer.length,
        leaseId: transaction.leaseId ?? null,
        createdById: userId,
      },
      select: documentSelect,
    });

    logger.info('Receipt document generated', {
      documentId: document.id,
      transactionId,
      generatedBy: userId,
    });

    return document;
  },

  async generateBoundaryCertificate(plotId: string, userId: string, role: Role, organisationId: string | null) {
    const plot = await prisma.plot.findUnique({
      where: { id: plotId },
      select: {
        id: true,
        plotNumber: true,
        areaSqm: true,
        centroidLat: true,
        centroidLng: true,
        boundaryGeoJSON: true,
        propertyId: true,
        property: {
          select: {
            name: true,
            address: true,
            region: true,
            organisationId: true,
            managers: {
              select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true },
            },
          },
        },
      },
    });

    if (!plot) throw ApiError.notFound('Plot');

    if (organisationId && plot.property.organisationId !== organisationId) {
      throw ApiError.notFound('Plot');
    }

    if (role !== Role.SUPER_ADMIN) {
      const isAssigned = plot.property.managers.some((m) => m.id === userId);
      if (!isAssigned) throw ApiError.forbidden();
    }

    const owner = plot.property.managers.find((m) => m.role === Role.ADMIN) ?? plot.property.managers[0] ?? null;

    const documentId = uuidv4();
    const referenceNo = `${brand.shortName}-BOUNDARY-${Date.now()}`;

    const pdfBuffer = await pdfService.generateBoundaryCertificate({
      documentId,
      referenceNo,
      plot: {
        plotNumber: plot.plotNumber,
        areaSqm: plot.areaSqm,
        centroidLat: plot.centroidLat,
        centroidLng: plot.centroidLng,
        boundaryGeoJSON: plot.boundaryGeoJSON,
      },
      property: { name: plot.property.name, address: plot.property.address, region: plot.property.region },
      owner: owner
        ? { firstName: owner.firstName, lastName: owner.lastName, email: owner.email, phone: owner.phone }
        : null,
      issueDate: new Date(),
    });

    const s3Key = s3Service.buildKey(`documents/boundary-cert/${plotId}`, 'application/pdf');
    const s3Url = await s3Service.uploadBuffer(s3Key, pdfBuffer, 'application/pdf');

    const document = await prisma.document.create({
      data: {
        id: documentId,
        s3Key,
        s3Url,
        title: `Boundary Certificate — ${plot.plotNumber}`,
        type: DocumentType.BOUNDARY_CERTIFICATE,
        mimeType: 'application/pdf',
        sizeBytes: pdfBuffer.length,
        plotId,
        createdById: userId,
      },
      select: documentSelect,
    });

    logger.info('Boundary certificate generated', {
      documentId: document.id,
      plotId,
      referenceNo,
      generatedBy: userId,
    });

    return document;
  },

  async generatePlotCertificate(plotId: string, userId: string, role: Role, organisationId: string | null) {
    const plot = await prisma.plot.findUnique({
      where: { id: plotId },
      select: {
        id: true,
        plotNumber: true,
        areaSqm: true,
        status: true,
        centroidLat: true,
        centroidLng: true,
        propertyId: true,
        property: {
          select: {
            name: true,
            address: true,
            region: true,
            organisationId: true,
            managers: { select: { id: true } },
          },
        },
        leaseAgreements: {
          where: { status: LeaseStatus.ACTIVE },
          select: {
            leaseNumber: true,
            startDate: true,
            endDate: true,
            monthlyRentGHS: true,
            tenant: {
              select: { user: { select: { firstName: true, lastName: true, email: true, phone: true } } },
            },
          },
          take: 1,
        },
      },
    });

    if (!plot) throw ApiError.notFound('Plot');

    if (role !== Role.SUPER_ADMIN) {
      const isAssigned = plot.property.managers.some((m) => m.id === userId);
      if (!isAssigned) throw ApiError.forbidden();
    }

    const activeLease = plot.leaseAgreements[0] ?? null;

    const documentId = uuidv4();
    const referenceNo = `${brand.shortName}-PLOTCERT-${Date.now()}`;

    const pdfBuffer = await pdfService.generatePlotCertificate({
      documentId,
      referenceNo,
      plot: {
        plotNumber: plot.plotNumber,
        areaSqm: plot.areaSqm,
        status: plot.status,
        centroidLat: plot.centroidLat,
        centroidLng: plot.centroidLng,
      },
      property: { name: plot.property.name, address: plot.property.address, region: plot.property.region },
      tenant: activeLease ? activeLease.tenant.user : null,
      lease: activeLease
        ? {
            leaseNumber: activeLease.leaseNumber,
            startDate: activeLease.startDate,
            endDate: activeLease.endDate,
            monthlyRentGHS: activeLease.monthlyRentGHS,
          }
        : null,
      issueDate: new Date(),
    });

    const s3Key = s3Service.buildKey(`documents/plot-cert/${plotId}`, 'application/pdf');
    const s3Url = await s3Service.uploadBuffer(s3Key, pdfBuffer, 'application/pdf');

    const document = await prisma.document.create({
      data: {
        id: documentId,
        s3Key,
        s3Url,
        title: `Plot Certificate — ${plot.plotNumber}`,
        type: DocumentType.PLOT_CERTIFICATE,
        mimeType: 'application/pdf',
        sizeBytes: pdfBuffer.length,
        plotId,
        createdById: userId,
      },
      select: documentSelect,
    });

    logger.info('Plot certificate generated', {
      documentId: document.id,
      plotId,
      referenceNo,
      generatedBy: userId,
    });

    return document;
  },

  async generateDemandLetter(leaseId: string, userId: string, role: Role, organisationId: string | null) {
    const lease = await prisma.leaseAgreement.findUnique({
      where: { id: leaseId },
      select: {
        id: true,
        leaseNumber: true,
        arrearsGHS: true,
        plot: {
          select: {
            plotNumber: true,
            propertyId: true,
            property: {
              select: { name: true, address: true, organisationId: true, managers: { select: { id: true } } },
            },
          },
        },
        tenant: {
          select: { user: { select: { firstName: true, lastName: true, email: true, phone: true } } },
        },
        rentRecords: {
          where: { isPaid: false, dueDate: { lt: new Date() } },
          select: { id: true },
        },
      },
    });

    if (!lease) throw ApiError.notFound('Lease');

    if (organisationId && lease.plot.property.organisationId !== organisationId) {
      throw ApiError.notFound('Lease');
    }

    if (role !== Role.SUPER_ADMIN) {
      const isAssigned = lease.plot.property.managers.some((m) => m.id === userId);
      if (!isAssigned) throw ApiError.forbidden();
    }

    const issueDate = new Date();
    const deadlineDate = new Date(issueDate);
    deadlineDate.setDate(deadlineDate.getDate() + 14);

    const documentId = uuidv4();
    const referenceNo = `${brand.shortName}-DEMAND-${Date.now()}`;

    const pdfBuffer = await pdfService.generateDemandLetter({
      documentId,
      referenceNo,
      tenant: lease.tenant.user,
      plot: { plotNumber: lease.plot.plotNumber },
      property: { name: lease.plot.property.name, address: lease.plot.property.address },
      lease: { leaseNumber: lease.leaseNumber },
      arrearsGHS: lease.arrearsGHS,
      monthsOverdue: lease.rentRecords.length,
      issueDate,
      deadlineDate,
    });

    const s3Key = s3Service.buildKey(`documents/demand-letter/${leaseId}`, 'application/pdf');
    const s3Url = await s3Service.uploadBuffer(s3Key, pdfBuffer, 'application/pdf');

    const document = await prisma.document.create({
      data: {
        id: documentId,
        s3Key,
        s3Url,
        title: `Demand Letter — ${lease.leaseNumber}`,
        type: DocumentType.ARREARS_NOTICE,
        mimeType: 'application/pdf',
        sizeBytes: pdfBuffer.length,
        leaseId,
        createdById: userId,
      },
      select: documentSelect,
    });

    logger.info('Demand letter generated', {
      documentId: document.id,
      leaseId,
      referenceNo,
      generatedBy: userId,
    });

    return document;
  },

  async generateLCSubmissionPackage(plotId: string, userId: string, role: Role, organisationId: string | null) {
    const plot = await prisma.plot.findUnique({
      where: { id: plotId },
      select: {
        id: true,
        plotNumber: true,
        areaSqm: true,
        boundaryGeoJSON: true,
        description: true,
        propertyId: true,
        property: {
          select: {
            name: true,
            address: true,
            region: true,
            district: true,
            organisationId: true,
            managers: {
              select: { id: true, firstName: true, lastName: true, email: true, phone: true, role: true },
            },
          },
        },
      },
    });

    if (!plot) throw ApiError.notFound('Plot');

    if (organisationId && plot.property.organisationId !== organisationId) {
      throw ApiError.notFound('Plot');
    }

    if (role !== Role.SUPER_ADMIN) {
      const isAssigned = plot.property.managers.some((m) => m.id === userId);
      if (!isAssigned) throw ApiError.forbidden();
    }

    const owner = plot.property.managers.find((m) => m.role === Role.ADMIN) ?? plot.property.managers[0] ?? null;

    const documentId = uuidv4();
    const referenceNo = `${brand.shortName}-LCPKG-${Date.now()}`;

    const pdfBuffer = await pdfService.generateLCSubmissionPackage({
      documentId,
      referenceNo,
      plot: {
        plotNumber: plot.plotNumber,
        areaSqm: plot.areaSqm,
        boundaryGeoJSON: plot.boundaryGeoJSON,
        description: plot.description,
      },
      property: {
        name: plot.property.name,
        address: plot.property.address,
        region: plot.property.region,
        district: plot.property.district,
      },
      owner: owner
        ? { firstName: owner.firstName, lastName: owner.lastName, email: owner.email, phone: owner.phone }
        : null,
      issueDate: new Date(),
    });

    const s3Key = s3Service.buildKey(`documents/lc-package/${plotId}`, 'application/pdf');
    const s3Url = await s3Service.uploadBuffer(s3Key, pdfBuffer, 'application/pdf');

    const document = await prisma.document.create({
      data: {
        id: documentId,
        s3Key,
        s3Url,
        title: `Lands Commission Submission Package — ${plot.plotNumber}`,
        type: DocumentType.LC_SUBMISSION_PACKAGE,
        mimeType: 'application/pdf',
        sizeBytes: pdfBuffer.length,
        plotId,
        createdById: userId,
      },
      select: documentSelect,
    });

    logger.info('Lands Commission submission package generated', {
      documentId: document.id,
      plotId,
      referenceNo,
      generatedBy: userId,
    });

    return document;
  },

  async generateAnnualReport(propertyId: string, year: number, userId: string, role: Role, organisationId: string | null) {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        name: true,
        address: true,
        region: true,
        organisationId: true,
        managers: { select: { id: true } },
      },
    });

    if (!property) throw ApiError.notFound('Property');

    if (organisationId && property.organisationId !== organisationId) {
      throw ApiError.notFound('Property');
    }

    if (role !== Role.SUPER_ADMIN) {
      const isAssigned = property.managers.some((m) => m.id === userId);
      if (!isAssigned) throw ApiError.forbidden();
    }

    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

    const [plots, transactions, arrearsLeases, alertCount, newLeasesCount] = await Promise.all([
      prisma.plot.findMany({
        where: { propertyId },
        select: {
          plotNumber: true,
          status: true,
          leaseAgreements: {
            where: { status: LeaseStatus.ACTIVE },
            select: { tenant: { select: { user: { select: { firstName: true, lastName: true } } } } },
            take: 1,
          },
        },
        orderBy: { plotNumber: 'asc' },
      }),
      prisma.transaction.findMany({
        where: {
          status: TransactionStatus.COMPLETED,
          paidAt: { gte: yearStart, lt: yearEnd },
          rentRecord: { lease: { plot: { propertyId } } },
        },
        select: { amountGHS: true, paidAt: true },
      }),
      prisma.leaseAgreement.findMany({
        where: { plot: { propertyId }, arrearsGHS: { gt: 0 } },
        select: { arrearsGHS: true },
      }),
      prisma.alertEvent.count({
        where: { alert: { propertyId }, triggeredAt: { gte: yearStart, lt: yearEnd } },
      }),
      prisma.leaseAgreement.count({
        where: { plot: { propertyId }, createdAt: { gte: yearStart, lt: yearEnd } },
      }),
    ]);

    const totalPlots = plots.length;
    const occupiedPlots = plots.filter((p) => p.status === PlotStatus.OCCUPIED).length;
    const occupancyRate = totalPlots > 0 ? (occupiedPlots / totalPlots) * 100 : 0;

    const quarterlyIncomeGHS: [number, number, number, number] = [0, 0, 0, 0];
    let totalIncomeGHS = 0;
    for (const tx of transactions) {
      totalIncomeGHS += tx.amountGHS;
      const month = (tx.paidAt ?? yearStart).getUTCMonth();
      const quarter = Math.floor(month / 3) as 0 | 1 | 2 | 3;
      quarterlyIncomeGHS[quarter] += tx.amountGHS;
    }

    const totalArrearsGHS = arrearsLeases.reduce((sum, l) => sum + l.arrearsGHS, 0);

    const plotRows = plots.map((p) => ({
      plotNumber: p.plotNumber,
      status: p.status,
      tenantName: p.leaseAgreements[0]
        ? `${p.leaseAgreements[0].tenant.user.firstName} ${p.leaseAgreements[0].tenant.user.lastName}`
        : null,
    }));

    const documentId = uuidv4();
    const referenceNo = `${brand.shortName}-ANNUAL-${Date.now()}`;

    const pdfBuffer = await pdfService.generateAnnualReport({
      documentId,
      referenceNo,
      property: { name: property.name, address: property.address, region: property.region },
      year,
      totalPlots,
      occupiedPlots,
      occupancyRate,
      totalIncomeGHS,
      quarterlyIncomeGHS,
      totalArrearsGHS,
      leasesInArrears: arrearsLeases.length,
      alertCount,
      newLeasesCount,
      plots: plotRows,
      issueDate: new Date(),
    });

    const s3Key = s3Service.buildKey(`documents/annual-report/${propertyId}`, 'application/pdf');
    const s3Url = await s3Service.uploadBuffer(s3Key, pdfBuffer, 'application/pdf');

    const document = await prisma.document.create({
      data: {
        id: documentId,
        s3Key,
        s3Url,
        title: `Annual Report — ${property.name} — ${year}`,
        type: DocumentType.ANNUAL_REPORT,
        mimeType: 'application/pdf',
        sizeBytes: pdfBuffer.length,
        createdById: userId,
      },
      select: documentSelect,
    });

    logger.info('Annual report generated', {
      documentId: document.id,
      propertyId,
      year,
      referenceNo,
      generatedBy: userId,
    });

    return document;
  },
};
