import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthenticatedRequest } from '../middleware/authenticate';
import { ApiError } from '../utils/ApiError';

interface PlotTileRow {
  tile: Buffer;
}

export const plotTilesController = {
  getTile: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const organisationId = authReq.organisationId ?? null;

    // Org-scoped users must have an organisationId (Rule 3).
    // Platform admins (no personal org) are allowed through; the propertyId
    // query param narrows their access to a specific property.
    if (!organisationId && !authReq.user.isPlatformAdmin) {
      throw ApiError.forbidden('This action requires an organisation context');
    }

    // Zod (tileParamSchema via validate middleware) has already coerced z/x/y
    // to integers and checked z in [0,22] and x,y >= 0.
    // The only cross-check Zod cannot express is x,y < 2**z.
    const z = Number(req.params.z);
    const x = Number(req.params.x);
    const y = Number(req.params.y);
    if (x >= 2 ** z || y >= 2 ** z) {
      throw ApiError.badRequest('Invalid tile coordinates');
    }

    // propertyId was validated as an optional CUID by tileQuerySchema.
    const propertyId = (req.query.propertyId as string | undefined) ?? null;

    // Build conditional SQL fragments so we never bind `null` into a positional
    // parameter — Prisma v5 can throw PrismaClientValidationError when a null
    // is bound with a ::text cast in some driver configurations.
    const orgCondition = organisationId
      ? Prisma.sql`AND pr."organisationId" = ${organisationId}`
      : Prisma.sql``;
    const propertyCondition = propertyId
      ? Prisma.sql`AND p."propertyId" = ${propertyId}`
      : Prisma.sql``;

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
          WHERE p.boundary IS NOT NULL
            ${orgCondition}
            ${propertyCondition}
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
