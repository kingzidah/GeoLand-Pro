import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const z = Number(process.argv[2]);
const x = Number(process.argv[3]);
const y = Number(process.argv[4]);
const orgId = process.argv[5];

async function main() {
  const rows = await prisma.$queryRaw<{ 'QUERY PLAN': string }[]>(
    Prisma.sql`
      EXPLAIN ANALYZE
      WITH bounds AS (
        SELECT
          ST_TileEnvelope(${z}::int, ${x}::int, ${y}::int) AS env_3857,
          ST_Transform(
            ST_TileEnvelope(${z}::int, ${x}::int, ${y}::int),
            4326
          ) AS env_4326
      ),
      mvt_geom AS (
        SELECT p.id, p.status,
          ST_AsMVTGeom(ST_Transform(p.boundary, 3857),
            (SELECT env_3857 FROM bounds), 4096, 64, true) AS geom
        FROM plots p
        INNER JOIN properties pr ON pr.id = p."propertyId"
        WHERE pr."organisationId" = ${orgId}
          AND p.boundary IS NOT NULL
          AND p.boundary && (SELECT env_4326 FROM bounds)
      )
      SELECT ST_AsMVT(mvt_geom, 'plots', 4096, 'geom')
      FROM mvt_geom
    `
  );
  for (const r of rows) console.log(r['QUERY PLAN']);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
