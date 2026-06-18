import { PrismaClient, Role, PlotStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;
const DEFAULT_PASSWORD = 'Password123!'; // Change before using in staging

async function main() {
  console.log('Seeding database...');

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);

  // ─── Organisations ─────────────────────────────────────────────────────────
  // Both rows are also inserted by the multi_tenancy migration (with these
  // exact IDs/slugs) so that existing data can be backfilled. Upsert by slug
  // here so this seed finds those rows on a freshly migrated database.

  const platformOrg = await prisma.organisation.upsert({
    where: { slug: 'geolandpro-platform' },
    update: {},
    create: {
      id: 'org_geolandpro_platform',
      name: 'GeoLand Pro Platform',
      slug: 'geolandpro-platform',
      subscriptionTier: 'ENTERPRISE',
      commissionRate: 0,
      maxProperties: 9999,
      maxUsers: 9999,
    },
  });

  const accraOrg = await prisma.organisation.upsert({
    where: { slug: 'accra-residential' },
    update: {},
    create: {
      id: 'org_accra_residential',
      name: 'Accra Residential Estate',
      slug: 'accra-residential',
      subscriptionTier: 'STANDARD',
      commissionRate: 0.10,
    },
  });

  // ─── Users ─────────────────────────────────────────────────────────────────

  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@geolandpro.com' },
    update: { isPlatformAdmin: true, organisationId: platformOrg.id },
    create: {
      email: 'superadmin@geolandpro.com',
      phone: '+233200000001',
      passwordHash,
      firstName: 'Super',
      lastName: 'Admin',
      role: Role.SUPER_ADMIN,
      isEmailVerified: true,
      isPlatformAdmin: true,
      organisationId: platformOrg.id,
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@geolandpro.com' },
    update: { role: Role.SUPER_ADMIN, organisationId: accraOrg.id },
    create: {
      email: 'admin@geolandpro.com',
      phone: '+233200000002',
      passwordHash,
      firstName: 'Land',
      lastName: 'Owner',
      role: Role.SUPER_ADMIN,
      isEmailVerified: true,
      organisationId: accraOrg.id,
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: 'manager@geolandpro.com' },
    update: { organisationId: accraOrg.id },
    create: {
      email: 'manager@geolandpro.com',
      phone: '+233200000003',
      passwordHash,
      firstName: 'Property',
      lastName: 'Manager',
      role: Role.MANAGER,
      isEmailVerified: true,
      organisationId: accraOrg.id,
    },
  });

  const surveyor = await prisma.user.upsert({
    where: { email: 'surveyor@geolandpro.com' },
    update: { organisationId: accraOrg.id },
    create: {
      email: 'surveyor@geolandpro.com',
      phone: '+233200000004',
      passwordHash,
      firstName: 'Field',
      lastName: 'Surveyor',
      role: Role.FIELD_SURVEYOR,
      isEmailVerified: true,
      organisationId: accraOrg.id,
    },
  });

  const tenant = await prisma.user.upsert({
    where: { email: 'tenant@geolandpro.com' },
    update: { organisationId: accraOrg.id },
    create: {
      email: 'tenant@geolandpro.com',
      phone: '+233200000005',
      passwordHash,
      firstName: 'John',
      lastName: 'Tenant',
      role: Role.TENANT,
      isEmailVerified: true,
      organisationId: accraOrg.id,
    },
  });

  // ─── Tenant profile ────────────────────────────────────────────────────────

  await prisma.tenantProfile.upsert({
    where: { userId: tenant.id },
    update: {},
    create: {
      userId: tenant.id,
      nationalIdType: 'Ghana Card',
      nationalIdNumber: 'GHA-000000001-0',
      dateOfBirth: new Date('1990-05-15'),
      occupation: 'Software Engineer',
      emergencyContact: {
        name: 'Jane Tenant',
        phone: '+233200000099',
        relationship: 'Spouse',
      },
    },
  });

  // ─── Property ──────────────────────────────────────────────────────────────

  // Route validation requires CUID-format IDs — let Prisma generate them
  // rather than hardcoding human-readable strings (matched by name instead)
  const existingProperty = await prisma.property.findFirst({
    where: { name: 'Accra Residential Estate' },
  });

  const property = existingProperty ?? await prisma.property.create({
    data: {
      name: 'Accra Residential Estate',
      description: 'Prime residential land in East Legon',
      address: '12 Independence Avenue, East Legon',
      region: 'Greater Accra Region',
      district: 'Accra Metropolitan',
      totalAreaSqm: 50_000,
      isActive: true,
      organisationId: accraOrg.id,
      managers: { connect: [{ id: admin.id }, { id: manager.id }] },
    },
  });

  // ─── Plots ─────────────────────────────────────────────────────────────────

  // Simple rectangular GeoJSON polygons (approximate East Legon coordinates)
  const plots = [
    {
      plotNumber: 'PLT-001',
      status: PlotStatus.VACANT,
      areaSqm: 500,
      centroidLat: 5.6352,
      centroidLng: -0.1647,
      boundaryGeoJSON: {
        type: 'Polygon',
        coordinates: [[
          [-0.1652, 5.6348],
          [-0.1642, 5.6348],
          [-0.1642, 5.6356],
          [-0.1652, 5.6356],
          [-0.1652, 5.6348],
        ]],
      },
    },
    {
      plotNumber: 'PLT-002',
      status: PlotStatus.VACANT,
      areaSqm: 600,
      centroidLat: 5.6360,
      centroidLng: -0.1630,
      boundaryGeoJSON: {
        type: 'Polygon',
        coordinates: [[
          [-0.1635, 5.6355],
          [-0.1625, 5.6355],
          [-0.1625, 5.6365],
          [-0.1635, 5.6365],
          [-0.1635, 5.6355],
        ]],
      },
    },
    {
      plotNumber: 'PLT-003',
      status: PlotStatus.VACANT,
      areaSqm: 450,
      centroidLat: 5.6344,
      centroidLng: -0.1620,
      boundaryGeoJSON: {
        type: 'Polygon',
        coordinates: [[
          [-0.1625, 5.6340],
          [-0.1615, 5.6340],
          [-0.1615, 5.6348],
          [-0.1625, 5.6348],
          [-0.1625, 5.6340],
        ]],
      },
    },
  ];

  for (const plot of plots) {
    await prisma.plot.upsert({
      where: { propertyId_plotNumber: { propertyId: property.id, plotNumber: plot.plotNumber } },
      update: {},
      create: {
        plotNumber: plot.plotNumber,
        propertyId: property.id,
        status: plot.status,
        areaSqm: plot.areaSqm,
        centroidLat: plot.centroidLat,
        centroidLng: plot.centroidLng,
        boundaryGeoJSON: plot.boundaryGeoJSON,
        createdById: manager.id,
      },
    });
  }

  // ─── Audit log for seed ───────────────────────────────────────────────────

  await prisma.auditLog.create({
    data: {
      userId: superAdmin.id,
      action: 'SEED_COMPLETED',
      entityType: 'System',
      entityId: 'seed',
      metadata: {
        usersCreated: 5,
        propertiesCreated: 1,
        plotsCreated: plots.length,
      },
    },
  });

  console.log(`
✓ Seeded successfully.

Organisations:
  ${platformOrg.name} (${platformOrg.slug}) — id: ${platformOrg.id}
  ${accraOrg.name} (${accraOrg.slug}) — id: ${accraOrg.id}

Credentials (password: "${DEFAULT_PASSWORD}" for all):
  PLATFORM ADMIN  superadmin@geolandpro.com   (${platformOrg.slug})
  SUPER_ADMIN     admin@geolandpro.com        (${accraOrg.slug})
  MANAGER         manager@geolandpro.com      (${accraOrg.slug})
  FIELD_SURVEYOR  surveyor@geolandpro.com     (${accraOrg.slug})
  TENANT          tenant@geolandpro.com       (${accraOrg.slug})

Property: "Accra Residential Estate" (id: ${property.id}, org: ${accraOrg.slug})
Plots: PLT-001, PLT-002, PLT-003 (all VACANT)
`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error('Seed failed:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
