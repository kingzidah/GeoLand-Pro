import { PrismaClient, Role, PlatformRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Adds the test accounts missing from prisma/seed.ts: a Role.ADMIN client
// user, plus one user per PlatformRole (Master Control). Safe to re-run —
// everything is upserted by email. Run after `npm run prisma:seed`.

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;
const DEFAULT_PASSWORD = 'Password123!';

async function main() {
  console.log('Seeding additional test-role accounts...');

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);

  const platformOrg = await prisma.organisation.findUnique({ where: { slug: 'geolandpro-platform' } });
  const accraOrg = await prisma.organisation.findUnique({ where: { slug: 'accra-residential' } });

  if (!platformOrg || !accraOrg) {
    throw new Error('Run `npm run prisma:seed` first — base organisations are missing.');
  }

  // ─── Role.ADMIN (apps/web) — currently no seeded account has this role ──────
  await prisma.user.upsert({
    where: { email: 'owner@geolandpro.com' },
    update: { role: Role.ADMIN, organisationId: accraOrg.id },
    create: {
      email: 'owner@geolandpro.com',
      phone: '+233200000006',
      passwordHash,
      firstName: 'Estate',
      lastName: 'Owner',
      role: Role.ADMIN,
      isEmailVerified: true,
      organisationId: accraOrg.id,
    },
  });

  // ─── Master Control platform roles ──────────────────────────────────────────

  // Promote the existing platform admin to TECHNICAL_DIRECTOR ("you" in Step 3)
  await prisma.user.update({
    where: { email: 'superadmin@geolandpro.com' },
    data: { platformRole: PlatformRole.TECHNICAL_DIRECTOR },
  });

  const platformSeats: Array<{ email: string; phone: string; firstName: string; lastName: string; platformRole: PlatformRole }> = [
    { email: 'md@geolandpro.com', phone: '+233200000010', firstName: 'Samuel', lastName: 'Director', platformRole: PlatformRole.MANAGING_DIRECTOR },
    { email: 'finance@geolandpro.com', phone: '+233200000011', firstName: 'Finance', lastName: 'Controller', platformRole: PlatformRole.FINANCE_CONTROLLER },
    { email: 'ops@geolandpro.com', phone: '+233200000012', firstName: 'Operations', lastName: 'Lead', platformRole: PlatformRole.OPERATIONS_LEAD },
    { email: 'observer@geolandpro.com', phone: '+233200000013', firstName: 'Board', lastName: 'Observer', platformRole: PlatformRole.BOARD_OBSERVER },
  ];

  for (const seat of platformSeats) {
    await prisma.user.upsert({
      where: { email: seat.email },
      update: { isPlatformAdmin: true, platformRole: seat.platformRole, organisationId: platformOrg.id },
      create: {
        email: seat.email,
        phone: seat.phone,
        passwordHash,
        firstName: seat.firstName,
        lastName: seat.lastName,
        role: Role.SUPER_ADMIN,
        isEmailVerified: true,
        isPlatformAdmin: true,
        platformRole: seat.platformRole,
        organisationId: platformOrg.id,
      },
    });
  }

  console.log(`
✓ Test-role accounts seeded (password: "${DEFAULT_PASSWORD}" for all):

  ADMIN              owner@geolandpro.com      (apps/web, ${accraOrg.slug})
  TECHNICAL_DIRECTOR superadmin@geolandpro.com (apps/master-control — promoted)
  MANAGING_DIRECTOR  md@geolandpro.com         (apps/master-control)
  FINANCE_CONTROLLER finance@geolandpro.com    (apps/master-control)
  OPERATIONS_LEAD    ops@geolandpro.com        (apps/master-control)
  BOARD_OBSERVER     observer@geolandpro.com   (apps/master-control)
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
