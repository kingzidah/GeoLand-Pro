import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const orgs = await prisma.$queryRaw<
    { id: string; name: string; slug: string; plotCount: bigint }[]
  >`
    SELECT o.id, o.name, o.slug, COUNT(p.id) AS "plotCount"
    FROM organisations o
    LEFT JOIN properties pr ON pr."organisationId" = o.id
    LEFT JOIN plots p ON p."propertyId" = pr.id AND p.boundary IS NOT NULL
    GROUP BY o.id, o.name, o.slug
    ORDER BY o.name
  `;
  console.log('Organisations with geocoded plots:');
  for (const o of orgs) {
    console.log(`  ${o.name} (${o.slug}) id=${o.id} plots=${o.plotCount}`);
  }

  console.log('\nSample tile coords (z=18) per org:');
  for (const o of orgs) {
    if (Number(o.plotCount) === 0) continue;
    const rows = await prisma.$queryRaw<
      { x: number; y: number; propertyId: string; plotNumber: string }[]
    >`
      SELECT
        FLOOR((ST_X(ST_Centroid(p.boundary)) + 180) / 360 * POW(2, 18))::int AS x,
        FLOOR(
          (1 - LN(TAN(RADIANS(ST_Y(ST_Centroid(p.boundary)))) +
                 1 / COS(RADIANS(ST_Y(ST_Centroid(p.boundary))))) / PI()) / 2 * POW(2, 18)
        )::int AS y,
        p."propertyId" AS "propertyId",
        p."plotNumber" AS "plotNumber"
      FROM plots p
      INNER JOIN properties pr ON pr.id = p."propertyId"
      WHERE pr."organisationId" = ${o.id} AND p.boundary IS NOT NULL
      LIMIT 1
    `;
    if (rows[0]) {
      console.log(`  ${o.name}: x=${rows[0].x} y=${rows[0].y} propertyId=${rows[0].propertyId} plotNumber=${rows[0].plotNumber}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
