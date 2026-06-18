import { PlotStatus, Prisma, Role } from '@prisma/client';
import {
  area as turfArea,
  centroid as turfCentroid,
  kinks as turfKinks,
  polygon as turfPolygon,
  booleanOverlap,
  booleanContains,
} from '@turf/turf';
import { prisma } from '../config/database';
import { ApiError } from '../utils/ApiError';
import { logger } from '../config/logger';
import { assertPropertyAccess } from './plot.service';
import type {
  SurveyImportInput,
  SurveyValidateInput,
  SurveyPointCaptureInput,
  SurveySessionCloseInput,
} from '../validations/survey.schema';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const surveyPlotSelect = {
  id: true,
  plotNumber: true,
  propertyId: true,
  status: true,
  areaSqm: true,
  centroidLat: true,
  centroidLng: true,
  boundaryGeoJSON: true,
  description: true,
  createdAt: true,
} as const;

interface ParsedPlot {
  plotLabel?: string;
  geometry: GeoJSON.Polygon;
  areaSqm: number;
  centroid: [number, number]; // [lng, lat]
  status?: PlotStatus;
  notes?: string;
}

function buildParsedPlotFromRing(
  points: [number, number][],
  plotLabel?: string,
  status?: PlotStatus,
  notes?: string
): ParsedPlot {
  if (points.length < 3) {
    throw ApiError.badRequest(`Plot "${plotLabel ?? 'unnamed'}" needs at least 3 points to form a boundary`);
  }

  const ring = [...points];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push(first);
  }

  const geometry: GeoJSON.Polygon = { type: 'Polygon', coordinates: [ring] };

  let areaSqm: number;
  let centroidCoords: [number, number];
  try {
    const poly = turfPolygon(geometry.coordinates);
    areaSqm = turfArea(poly);
    centroidCoords = turfCentroid(poly).geometry.coordinates as [number, number];
  } catch {
    throw ApiError.badRequest(`Plot "${plotLabel ?? 'unnamed'}" boundary is not a valid polygon`);
  }

  return { plotLabel, geometry, areaSqm, centroid: centroidCoords, status, notes };
}

function buildParsedPlotFromGeoJSONPolygon(
  coordinates: number[][][],
  plotLabel?: string,
  status?: PlotStatus,
  notes?: string
): ParsedPlot {
  const ring = (coordinates[0] ?? []).map(([lng, lat]) => [lng, lat] as [number, number]);
  return buildParsedPlotFromRing(ring, plotLabel, status, notes);
}

function parseGeoJSONFormat(data: unknown): ParsedPlot[] {
  const root = data as { type?: string; features?: unknown[]; properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: number[][][] } };

  let features: { properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: number[][][] } }[];
  if (root?.type === 'FeatureCollection' && Array.isArray(root.features)) {
    features = root.features as typeof features;
  } else if (root?.type === 'Feature') {
    features = [root as (typeof features)[number]];
  } else if (root?.type === 'Polygon') {
    features = [{ properties: {}, geometry: root as { type: string; coordinates: number[][][] } }];
  } else {
    throw ApiError.badRequest('GeoJSON must be a FeatureCollection of Polygon features');
  }

  if (features.length === 0) {
    throw ApiError.badRequest('GeoJSON FeatureCollection contains no features');
  }

  return features.map((feature, idx) => {
    const geometry = feature.geometry;
    if (!geometry || geometry.type !== 'Polygon' || !Array.isArray(geometry.coordinates)) {
      throw ApiError.badRequest(`Feature ${idx + 1} is not a Polygon geometry`);
    }
    const props = feature.properties ?? {};
    const plotLabel = typeof props.plotId === 'string' ? props.plotId : undefined;
    const status = typeof props.status === 'string' ? (props.status as PlotStatus) : undefined;
    const notes = typeof props.notes === 'string' ? props.notes : undefined;
    return buildParsedPlotFromGeoJSONPolygon(geometry.coordinates, plotLabel, status, notes);
  });
}

function parseCSVFormat(csvText: string): ParsedPlot[] {
  const lines = csvText
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    throw ApiError.badRequest('CSV must contain a header row and at least one data row');
  }

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const idxPlotId = header.indexOf('plotid');
  const idxPointIndex = header.indexOf('pointindex');
  const idxLat = header.indexOf('latitude');
  const idxLng = header.indexOf('longitude');
  const idxElev = header.indexOf('elevation');

  if (idxPlotId === -1 || idxLat === -1 || idxLng === -1) {
    throw ApiError.badRequest('CSV header must include plotId, latitude, and longitude columns');
  }

  const groups = new Map<string, { pointIndex: number; lat: number; lng: number }[]>();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    const plotId = cols[idxPlotId];
    const lat = Number(cols[idxLat]);
    const lng = Number(cols[idxLng]);

    if (!plotId || Number.isNaN(lat) || Number.isNaN(lng)) {
      throw ApiError.badRequest(`Invalid CSV row ${i + 1}: "${lines[i]}"`);
    }

    const pointIndex = idxPointIndex !== -1 && cols[idxPointIndex] !== ''
      ? Number(cols[idxPointIndex])
      : (groups.get(plotId)?.length ?? 0);

    if (!groups.has(plotId)) groups.set(plotId, []);
    groups.get(plotId)!.push({ pointIndex, lat, lng });
    void idxElev;
  }

  return Array.from(groups.entries()).map(([plotId, points]) => {
    points.sort((a, b) => a.pointIndex - b.pointIndex);
    const ring = points.map((p) => [p.lng, p.lat] as [number, number]);
    return buildParsedPlotFromRing(ring, plotId);
  });
}

function parseManualFormat(data: {
  plotLabel?: string;
  points: { lat: number; lng: number; elev?: number }[];
  status?: PlotStatus;
  notes?: string;
}): ParsedPlot[] {
  const ring = data.points.map((p) => [p.lng, p.lat] as [number, number]);
  return [buildParsedPlotFromRing(ring, data.plotLabel, data.status, data.notes)];
}

function parseByFormat(input: SurveyImportInput | SurveyValidateInput): ParsedPlot[] {
  switch (input.format) {
    case 'GEOJSON':
      return parseGeoJSONFormat(input.data);
    case 'CSV':
      return parseCSVFormat(input.data);
    case 'MANUAL':
      return parseManualFormat(input.data);
  }
}

function hasSelfIntersection(geometry: GeoJSON.Polygon): boolean {
  try {
    const result = turfKinks(turfPolygon(geometry.coordinates));
    return result.features.length > 0;
  } catch {
    return false;
  }
}

function polygonsOverlap(a: GeoJSON.Polygon, b: GeoJSON.Polygon): boolean {
  try {
    const fa = turfPolygon(a.coordinates);
    const fb = turfPolygon(b.coordinates);
    return booleanOverlap(fa, fb) || booleanContains(fa, fb) || booleanContains(fb, fa);
  } catch {
    return false;
  }
}

/** Generates the next sequential plot number following the property's existing numbering scheme. */
function nextPlotNumber(allNumbers: string[], used: Set<string>): string {
  let max = 0;
  let prefix = 'PLT-';
  let digits = 3;
  for (const num of allNumbers) {
    const match = num.match(/^(.*?)(\d+)\s*$/);
    if (!match) continue;
    const n = parseInt(match[2], 10);
    if (n > max) {
      max = n;
      prefix = match[1];
      digits = match[2].length;
    }
  }
  let next = max + 1;
  let candidate = `${prefix}${String(next).padStart(digits, '0')}`;
  while (used.has(candidate)) {
    next += 1;
    candidate = `${prefix}${String(next).padStart(digits, '0')}`;
  }
  return candidate;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const surveyService = {
  /** Returns a downloadable CSV template for RTK GPS plot surveys. */
  getTemplate(): string {
    return [
      'plotId,pointIndex,latitude,longitude,elevation',
      'PLT-101,0,5.614818,-0.205874,45.2',
      'PLT-101,1,5.614820,-0.205650,45.0',
      'PLT-101,2,5.614620,-0.205648,44.8',
      'PLT-101,3,5.614618,-0.205872,45.1',
    ].join('\n');
  },

  async validate(propertyId: string, userId: string, role: Role, input: SurveyValidateInput, organisationId: string | null) {
    await assertPropertyAccess(propertyId, userId, role, organisationId);

    const errors: string[] = [];
    const warnings: string[] = [];

    let parsed: ParsedPlot[] = [];
    try {
      parsed = parseByFormat(input);
    } catch (err) {
      errors.push(err instanceof ApiError ? err.message : 'Failed to parse survey data');
      return { valid: false, warnings, errors, calculatedAreaM2: 0 };
    }

    if (parsed.length === 0) {
      errors.push('No valid plot boundaries found in the supplied data');
      return { valid: false, warnings, errors, calculatedAreaM2: 0 };
    }

    const existingPlots = await prisma.plot.findMany({
      where: { propertyId },
      select: { plotNumber: true, boundaryGeoJSON: true },
    });

    let totalArea = 0;
    for (const plot of parsed) {
      totalArea += plot.areaSqm;
      const label = plot.plotLabel ?? 'unnamed';

      for (const [lng, lat] of plot.geometry.coordinates[0]) {
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          errors.push(`Plot "${label}" has out-of-range coordinates (lat ${lat}, lng ${lng})`);
        }
      }

      if (plot.geometry.coordinates[0].length < 4) {
        errors.push(`Plot "${label}" boundary must have at least 3 distinct points`);
      }

      if (hasSelfIntersection(plot.geometry)) {
        errors.push(`Plot "${label}" boundary lines cross themselves (self-intersecting)`);
      }

      for (const existing of existingPlots) {
        if (polygonsOverlap(plot.geometry, existing.boundaryGeoJSON as unknown as GeoJSON.Polygon)) {
          warnings.push(`Plot "${label}" overlaps with existing plot "${existing.plotNumber}"`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      warnings,
      errors,
      calculatedAreaM2: Math.round(totalArea * 100) / 100,
    };
  },

  async import(propertyId: string, userId: string, role: Role, input: SurveyImportInput, organisationId: string | null) {
    await assertPropertyAccess(propertyId, userId, role, organisationId);

    const parsed = parseByFormat(input);
    if (parsed.length === 0) {
      throw ApiError.badRequest('No valid plot boundaries found in the supplied data');
    }

    for (const plot of parsed) {
      if (hasSelfIntersection(plot.geometry)) {
        throw ApiError.badRequest(`Plot "${plot.plotLabel ?? 'unnamed'}" boundary is self-intersecting`);
      }
    }

    const existingPlots = await prisma.plot.findMany({
      where: { propertyId },
      select: { plotNumber: true },
    });
    const allNumbers = existingPlots.map((p) => p.plotNumber);
    const usedNumbers = new Set(allNumbers);

    const created = [];
    for (const plot of parsed) {
      let plotNumber = plot.plotLabel?.trim();
      if (!plotNumber || usedNumbers.has(plotNumber)) {
        plotNumber = nextPlotNumber(allNumbers, usedNumbers);
      }
      usedNumbers.add(plotNumber);
      allNumbers.push(plotNumber);

      const createdPlot = await prisma.plot.create({
        data: {
          plotNumber,
          propertyId,
          status: plot.status ?? PlotStatus.VACANT,
          areaSqm: plot.areaSqm,
          centroidLat: plot.centroid[1],
          centroidLng: plot.centroid[0],
          boundaryGeoJSON: plot.geometry as unknown as Prisma.InputJsonValue,
          description: plot.notes,
          createdById: userId,
        },
        select: surveyPlotSelect,
      });
      created.push(createdPlot);
    }

    await prisma.surveyImport.create({
      data: {
        propertyId,
        importedById: userId,
        format: input.format,
        plotsCreated: created.length,
        plotIds: created.map((p) => p.id),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'SURVEY_IMPORTED',
        entityType: 'Property',
        entityId: propertyId,
        metadata: { format: input.format, plotsCreated: created.length, plotIds: created.map((p) => p.id) },
      },
    });

    logger.info('Survey import completed', { propertyId, format: input.format, plotsCreated: created.length, importedBy: userId });
    return created;
  },

  // ─── GPS point capture ──────────────────────────────────────────────────────

  async addPoint(propertyId: string, userId: string, role: Role, body: SurveyPointCaptureInput, organisationId: string | null) {
    await assertPropertyAccess(propertyId, userId, role, organisationId);

    const point = await prisma.surveyPoint.create({
      data: {
        propertyId,
        sessionId: body.sessionId,
        pointIndex: body.pointIndex,
        latitude: body.latitude,
        longitude: body.longitude,
        elevation: body.elevation,
        accuracy: body.accuracy,
        capturedAt: body.timestamp ? new Date(body.timestamp) : new Date(),
        label: body.label,
        notes: body.notes,
        createdById: userId,
      },
    });

    return point;
  },

  async getSessionPoints(propertyId: string, sessionId: string, userId: string, role: Role, organisationId: string | null) {
    await assertPropertyAccess(propertyId, userId, role, organisationId);

    return prisma.surveyPoint.findMany({
      where: { propertyId, sessionId },
      orderBy: { pointIndex: 'asc' },
    });
  },

  async listSessions(propertyId: string, userId: string, role: Role, organisationId: string | null) {
    await assertPropertyAccess(propertyId, userId, role, organisationId);

    const points = await prisma.surveyPoint.findMany({
      where: { propertyId, closed: false },
      orderBy: { capturedAt: 'asc' },
      select: { sessionId: true, capturedAt: true },
    });

    const sessions = new Map<string, { sessionId: string; pointCount: number; startedAt: Date; lastPointAt: Date }>();
    for (const p of points) {
      const existing = sessions.get(p.sessionId);
      if (!existing) {
        sessions.set(p.sessionId, { sessionId: p.sessionId, pointCount: 1, startedAt: p.capturedAt, lastPointAt: p.capturedAt });
      } else {
        existing.pointCount += 1;
        if (p.capturedAt < existing.startedAt) existing.startedAt = p.capturedAt;
        if (p.capturedAt > existing.lastPointAt) existing.lastPointAt = p.capturedAt;
      }
    }

    return Array.from(sessions.values());
  },

  async closeSession(propertyId: string, sessionId: string, userId: string, role: Role, body: SurveySessionCloseInput, organisationId: string | null) {
    await assertPropertyAccess(propertyId, userId, role, organisationId);

    const points = await prisma.surveyPoint.findMany({
      where: { propertyId, sessionId, closed: false },
      orderBy: { pointIndex: 'asc' },
    });

    if (points.length < 3) {
      throw ApiError.badRequest('A GPS session needs at least 3 captured points to form a plot boundary');
    }

    const ring = points.map((p) => [p.longitude, p.latitude] as [number, number]);
    const parsedPlot = buildParsedPlotFromRing(ring, body.plotLabel, body.status, body.notes);

    if (hasSelfIntersection(parsedPlot.geometry)) {
      throw ApiError.badRequest('GPS session boundary is self-intersecting — review the captured points');
    }

    const existingPlots = await prisma.plot.findMany({
      where: { propertyId },
      select: { plotNumber: true },
    });
    const allNumbers = existingPlots.map((p) => p.plotNumber);
    const usedNumbers = new Set(allNumbers);

    let plotNumber = parsedPlot.plotLabel?.trim();
    if (!plotNumber || usedNumbers.has(plotNumber)) {
      plotNumber = nextPlotNumber(allNumbers, usedNumbers);
    }

    const plot = await prisma.plot.create({
      data: {
        plotNumber,
        propertyId,
        status: parsedPlot.status ?? PlotStatus.VACANT,
        areaSqm: parsedPlot.areaSqm,
        centroidLat: parsedPlot.centroid[1],
        centroidLng: parsedPlot.centroid[0],
        boundaryGeoJSON: parsedPlot.geometry as unknown as Prisma.InputJsonValue,
        description: parsedPlot.notes,
        createdById: userId,
      },
      select: surveyPlotSelect,
    });

    await prisma.surveyPoint.updateMany({
      where: { propertyId, sessionId },
      data: { closed: true },
    });

    await prisma.surveyImport.create({
      data: {
        propertyId,
        importedById: userId,
        format: 'GPS_SESSION',
        plotsCreated: 1,
        plotIds: [plot.id],
      },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'SURVEY_IMPORTED',
        entityType: 'Property',
        entityId: propertyId,
        metadata: { format: 'GPS_SESSION', sessionId, plotId: plot.id },
      },
    });

    logger.info('GPS survey session closed into plot', { propertyId, sessionId, plotId: plot.id, by: userId });
    return plot;
  },

  // ─── History ─────────────────────────────────────────────────────────────────

  async listImports(propertyId: string, userId: string, role: Role, organisationId: string | null) {
    await assertPropertyAccess(propertyId, userId, role, organisationId);

    return prisma.surveyImport.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'desc' },
      include: {
        importedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  },
};
