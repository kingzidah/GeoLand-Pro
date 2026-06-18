/**
 * Applies PostGIS geometry columns, spatial indexes, and the boundary-sync trigger.
 * Run after `prisma migrate dev` — cross-platform, no psql binary required.
 *
 * Hardcoded statements match prisma/migrations/add_postgis_columns.sql exactly.
 * If you update that SQL file, sync the STATEMENTS array below.
 *
 * Usage: npm run db:postgis  (from apps/api/)
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Each entry is one DDL statement executed via $executeRawUnsafe.
// Hardcoded rather than parsed so semicolons inside PL/pgSQL function bodies
// are never mistaken for statement delimiters.
const STATEMENTS: { label: string; sql: string }[] = [
  {
    label: 'Enable postgis extension',
    sql: `CREATE EXTENSION IF NOT EXISTS postgis`,
  },
  {
    label: 'plots: add boundary column',
    sql: `ALTER TABLE plots ADD COLUMN IF NOT EXISTS boundary geometry(Polygon, 4326)`,
  },
  {
    label: 'plots: create GIST index',
    sql: `CREATE INDEX IF NOT EXISTS idx_plots_boundary ON plots USING GIST (boundary)`,
  },
  {
    label: 'properties: add boundary column',
    sql: `ALTER TABLE properties ADD COLUMN IF NOT EXISTS boundary geometry(MultiPolygon, 4326)`,
  },
  {
    label: 'properties: create GIST index',
    sql: `CREATE INDEX IF NOT EXISTS idx_properties_boundary ON properties USING GIST (boundary)`,
  },
  {
    label: 'geofence_alerts: add boundary column',
    sql: `ALTER TABLE geofence_alerts ADD COLUMN IF NOT EXISTS boundary geometry(Polygon, 4326)`,
  },
  {
    label: 'geofence_alerts: create GIST index',
    sql: `CREATE INDEX IF NOT EXISTS idx_geofence_alerts_boundary ON geofence_alerts USING GIST (boundary)`,
  },
  {
    label: 'Create sync_plot_boundary() trigger function',
    sql: `
CREATE OR REPLACE FUNCTION sync_plot_boundary()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."boundaryGeoJSON" IS NOT NULL THEN
    NEW.boundary = ST_SetSRID(
      ST_GeomFromGeoJSON(NEW."boundaryGeoJSON"::text),
      4326
    );
    NEW."areaSqm"      = ST_Area(NEW.boundary::geography);
    NEW."centroidLat"  = ST_Y(ST_Centroid(NEW.boundary));
    NEW."centroidLng"  = ST_X(ST_Centroid(NEW.boundary));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
    `.trim(),
  },
  {
    label: 'Drop old trigger (idempotent)',
    sql: `DROP TRIGGER IF EXISTS trg_sync_plot_boundary ON plots`,
  },
  {
    label: 'Create trg_sync_plot_boundary trigger',
    sql: `
CREATE TRIGGER trg_sync_plot_boundary
  BEFORE INSERT OR UPDATE OF "boundaryGeoJSON"
  ON plots
  FOR EACH ROW EXECUTE FUNCTION sync_plot_boundary()
    `.trim(),
  },
];

async function main(): Promise<void> {
  console.log(`\nApplying ${STATEMENTS.length} PostGIS statements...\n`);

  for (const { label, sql } of STATEMENTS) {
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log(`  ✓  ${label}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // All statements use IF NOT EXISTS / OR REPLACE — these should not appear,
      // but guard anyway in case of version-specific PG behaviour
      if (msg.toLowerCase().includes('already exists')) {
        console.log(`  ~  ${label} (already exists, skipped)`);
      } else {
        console.error(`\n  ✗  Failed: ${label}`);
        console.error(`     ${msg}\n`);
        throw err;
      }
    }
  }

  console.log('\n✓  PostGIS migration applied successfully.\n');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error('\nPostGIS migration failed:', (err as Error).message);
    await prisma.$disconnect();
    process.exit(1);
  });
