import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthenticatedRequest } from '../middleware/authenticate';
import { ApiError } from '../utils/ApiError';

const MAX_ZOOM = 22;

interface PlotTileRow {
  tile: Buffer;
}

/**
 * Serves Mapbox Vector Tiles (MVT) of plot boundaries for the 3D map.
 *
 * GET /api/plots/tiles/:z/:x/:y.pbf?propertyId=...
 *
 * Tenancy is enforced via an INNER JOIN to `properties` (plots have no
 * organisationId of their own — see ADR-MAP-005). Geometry is read from the
 * `boundary` PostGIS column (synced from boundaryGeoJSON by sync_plot_boundary).
 * Per ADR-MAP-006, no extrusion_height column exists — the client computes
 * extrusion height from `status`/`area_sqm` itself.
 */
export const plotTilesController = {
  getTile: asyncHandler(async (req: Request, res: Response) => {
    const organisationId = (req as AuthenticatedRequest).organisationId;
    if (!organisationId) {
      throw ApiError.forbidden('This action requires an organisation context');
    }

    const z = Number(req.params.z);
    const x = Number(req.params.x);
    const y = Number(req.params.y);

    if (
      !Number.isInteger(z) ||
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      z < 0 ||
      z > MAX_ZOOM ||
      x < 0 ||
      x >= 2 ** z ||
      y < 0 ||
      y >= 2 ** z
    ) {
      throw ApiError.badRequest('Invalid tile coordinates');
    }

    const propertyId = typeof req.query.propertyId === 'string' ? req.query.propertyId : null;

    const rows = await prisma.$queryRaw<PlotTileRow[]>(
      Prisma.sql`
        WITH bounds AS (
          SELECT
            ST_TileEnvelope(${z}::int, ${x}::int, ${y}::int) AS env_3857,
            ST_Transform(
              ST_TileEnvelope(${z}::int, ${x}::int, ${y}::int),
              4326
            ) AS env_4326
        ),
        mvt_geom AS (
          SELECT
            p.id,
            p."plotNumber" AS plot_code,
            p.status::text AS status,
            p."areaSqm" AS area_sqm,
            p."propertyId" AS property_id,
            ST_AsMVTGeom(
              ST_Transform(p.boundary, 3857),
              (SELECT env_3857 FROM bounds),
              4096,
              64,
              true
            ) AS geom
          FROM plots p
          INNER JOIN properties pr ON pr.id = p."propertyId"
          WHERE pr."organisationId" = ${organisationId}
            AND p.boundary IS NOT NULL
            AND (${propertyId}::text IS NULL OR p."propertyId" = ${propertyId})
            AND p.boundary && (SELECT env_4326 FROM bounds)
        )
        SELECT ST_AsMVT(mvt_geom, 'plots', 4096, 'geom') AS tile
        FROM mvt_geom
        WHERE geom IS NOT NULL
      `
    );

    const tile = rows[0]?.tile;

    if (!tile || tile.length === 0) {
      res.status(204).end();
      return;
    }

    res.setHeader('Content-Type', 'application/x-protobuf');
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.status(200).send(tile);
  }),
};
