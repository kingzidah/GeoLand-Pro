/**
 * Generates a simulated, zoned "mini-city" layout over a real Karlsruhe,
 * Germany bounding box — a stand-in for the client's actual Ghana property
 * while we don't yet have drone/survey data for the real site. Three land-use
 * bands (farmland, residential, apartments/commercial) sit side by side, each
 * with its own plot size and a portion of cells reserved as roads/green space,
 * so the simulation reads like a real subdivided development rather than a
 * uniform grid.
 */
import { PrismaClient, PlotStatus, Prisma } from '@prisma/client';
import * as turf from '@turf/turf';

const prisma = new PrismaClient();

const PROPERTY_NAME = 'Karlsruhe Simulation Estate';

// Roughly 2.6km x 3.9km (~10 km² / ~2,500 acres) on the northeastern outskirts
// of Karlsruhe — large enough to simulate a full mini-city of zoned land use.
const FULL_BBOX: [number, number, number, number] = [8.4000, 49.0000, 8.4350, 49.0350];

const ROAD_RESERVE_RATIO = 0.22;

// Overall target: ~70% occupied, mixed in with vacant/reserved/disputed.
const STATUS_WEIGHTS: Array<[PlotStatus, number]> = [
  [PlotStatus.OCCUPIED, 0.70],
  [PlotStatus.VACANT, 0.18],
  [PlotStatus.RESERVED, 0.08],
  [PlotStatus.DISPUTED, 0.04],
];

interface Zone {
  name: string;
  description: string;
  /** [southFraction, northFraction] of the full bbox height occupied by this band */
  latBand: [number, number];
  /** Square plot side length, in km */
  cellSideKm: number;
}

const ZONES: Zone[] = [
  {
    name: 'Apartments & Commercial',
    description: 'High-density apartment and commercial frontage zone',
    latBand: [0, 0.25],
    cellSideKm: 0.06, // ~200 ft
  },
  {
    name: 'Residential',
    description: 'Standard residential subdivision — single-family plots',
    latBand: [0.25, 0.65],
    cellSideKm: 0.0305, // ~100 ft, the standard Ghanaian plot dimension
  },
  {
    name: 'Farmland',
    description: 'Agricultural smallholdings on the rural fringe',
    latBand: [0.65, 1],
    cellSideKm: 0.12, // ~400 ft (~3.5 acres) — larger farm plots
  },
];

function pickStatus(rand: number): PlotStatus {
  let cumulative = 0;
  for (const [status, weight] of STATUS_WEIGHTS) {
    cumulative += weight;
    if (rand < cumulative) return status;
  }
  return PlotStatus.VACANT;
}

// Deterministic pseudo-random so re-runs produce the same layout
function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function zoneBbox(zone: Zone): [number, number, number, number] {
  const [west, south, east, north] = FULL_BBOX;
  const height = north - south;
  return [
    west,
    south + zone.latBand[0] * height,
    east,
    south + zone.latBand[1] * height,
  ];
}

async function main() {
  console.log('Generating zoned Karlsruhe simulation mini-city...');

  const surveyor = await prisma.user.findUnique({ where: { email: 'surveyor@geolandpro.com' } });
  const manager = await prisma.user.findUnique({ where: { email: 'manager@geolandpro.com' } });
  const admin = await prisma.user.findUnique({ where: { email: 'admin@geolandpro.com' } });
  const superAdmin = await prisma.user.findUnique({ where: { email: 'superadmin@geolandpro.com' } });
  const createdBy = surveyor ?? manager ?? admin;
  if (!createdBy) {
    throw new Error('Run the main seed first — surveyor/manager/admin users not found.');
  }

  // This simulation property lives under the internal GeoLand Pro platform
  // organisation, not the client's organisation.
  const platformOrg = await prisma.organisation.findUnique({ where: { slug: 'geolandpro-platform' } });
  if (!platformOrg) {
    throw new Error('Run the main seed first — "geolandpro-platform" organisation not found.');
  }
  // Give every staff role visibility into the simulation estate (property
  // listing is scoped to assigned managers for non-SUPER_ADMIN roles).
  const managerIds = [surveyor, manager, admin, superAdmin]
    .filter((u): u is NonNullable<typeof u> => !!u)
    .map((u) => ({ id: u.id }));

  const rand = seededRandom(42);

  let totalAreaSqm = 0;
  let plotIndex = 0;
  const plotsToCreate: Array<{
    plotNumber: string;
    status: PlotStatus;
    areaSqm: number;
    centroidLat: number;
    centroidLng: number;
    boundaryGeoJSON: Prisma.InputJsonValue;
    description: string;
    propertyId: string;
    createdById: string;
  }> = [];

  const zoneSummaries: Array<{ name: string; cells: number; reserved: number; plots: number }> = [];

  for (const zone of ZONES) {
    const grid = turf.squareGrid(zoneBbox(zone), zone.cellSideKm, { units: 'kilometers' });
    const cells = grid.features;

    const order = cells.map((_, i) => i).sort(() => rand() - 0.5);
    const reserveCount = Math.round(cells.length * ROAD_RESERVE_RATIO);
    const reservedIndices = new Set(order.slice(0, reserveCount));

    let zonePlotCount = 0;
    for (let i = 0; i < cells.length; i++) {
      if (reservedIndices.has(i)) continue;

      const cell = cells[i];
      const polygon = cell.geometry as GeoJSON.Polygon;
      const areaSqm = turf.area(cell);
      const [lng, lat] = turf.centroid(cell).geometry.coordinates;

      plotIndex += 1;
      zonePlotCount += 1;
      totalAreaSqm += areaSqm;

      plotsToCreate.push({
        plotNumber: `KA-${String(plotIndex).padStart(4, '0')}`,
        status: pickStatus(rand()),
        areaSqm: Math.round(areaSqm),
        centroidLat: lat,
        centroidLng: lng,
        boundaryGeoJSON: polygon as unknown as Prisma.InputJsonValue,
        description: `${zone.name} — ${zone.description} (simulated, placeholder over Karlsruhe, DE pending real Ghana survey data)`,
        propertyId: '', // filled in after property is created
        createdById: createdBy.id,
      });
    }

    zoneSummaries.push({
      name: zone.name,
      cells: cells.length,
      reserved: reservedIndices.size,
      plots: zonePlotCount,
    });
  }

  const property = await prisma.property.upsert({
    where: { id: (await prisma.property.findFirst({ where: { name: PROPERTY_NAME } }))?.id ?? '__none__' },
    update: {
      managers: { set: managerIds },
    },
    create: {
      name: PROPERTY_NAME,
      description:
        'Simulated zoned mini-city layout (apartments/commercial, residential, farmland — with roads ' +
        'and green space) over a real Karlsruhe, Germany bounding box. Used as a visual stand-in for ' +
        'the client\'s large Ghana property until on-site drone/survey data is available.',
      address: 'Northeastern outskirts of Karlsruhe, Baden-Württemberg, Germany (placeholder coordinates)',
      region: 'Simulation — Baden-Württemberg',
      district: 'Karlsruhe (Stadtkreis)',
      totalAreaSqm: Math.round(totalAreaSqm),
      isActive: true,
      organisationId: platformOrg.id,
      managers: { connect: managerIds },
    },
  });

  for (const plot of plotsToCreate) plot.propertyId = property.id;

  // Clear any previous run's plots for this property so re-seeding is idempotent
  await prisma.plot.deleteMany({ where: { propertyId: property.id } });

  const BATCH = 500;
  for (let i = 0; i < plotsToCreate.length; i += BATCH) {
    await prisma.plot.createMany({ data: plotsToCreate.slice(i, i + BATCH) });
  }

  const counts = await prisma.plot.groupBy({
    by: ['status'],
    where: { propertyId: property.id },
    _count: true,
  });
  const occupiedPct = ((counts.find((c) => c.status === 'OCCUPIED')?._count ?? 0) / plotsToCreate.length) * 100;

  console.log(`
✓ Karlsruhe simulation mini-city generated.

Property: "${property.name}" (id: ${property.id})
Total simulated area: ${(totalAreaSqm / 4046.86).toFixed(1)} acres
Total plots: ${plotsToCreate.length}  (${occupiedPct.toFixed(1)}% occupied)

Zones:
${zoneSummaries.map((z) => `  ${z.name.padEnd(26)} ${z.plots} plots  (${z.cells} cells, ${z.reserved} reserved as roads/green space)`).join('\n')}

Status breakdown:
${counts.map((c) => `  ${c.status.padEnd(12)} ${c._count}`).join('\n')}
`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error('Simulation seed failed:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
