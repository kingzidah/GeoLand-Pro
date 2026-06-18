import { bbox as turfBbox, centroid as turfCentroid } from '@turf/turf';
import { prisma } from '../config/database';
import { ApiError } from '../utils/ApiError';

// Yearly cloud-free Sentinel-2 composite — free, no API key required.
const SENTINEL2_TILE_URL =
  'https://s2maps.eu/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=s2cloudless-2023&STYLE=default&TILEMATRIXSET=PopularWebMercator&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';

const MIN_ZOOM = 10;
const MAX_ZOOM = 18;

export async function getSentinel2TileUrl(
  _bbox: [number, number, number, number],
  _date?: string
): Promise<string> {
  return SENTINEL2_TILE_URL;
}

function calculateZoom(bounds: [number, number, number, number]): number {
  const [minLng, minLat, maxLng, maxLat] = bounds;
  const lngSpan = Math.max(maxLng - minLng, 1e-6);
  const latSpan = Math.max(maxLat - minLat, 1e-6);
  const span = Math.max(lngSpan, latSpan);
  const zoom = Math.floor(Math.log2(360 / span));
  return Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM);
}

export async function getPropertySatelliteInfo(propertyId: string): Promise<{
  tileUrl: string;
  bbox: [number, number, number, number];
  centerLat: number;
  centerLng: number;
  zoom: number;
}> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true, boundaryGeoJSON: true },
  });

  if (!property) throw ApiError.notFound('Property');
  if (!property.boundaryGeoJSON) {
    throw ApiError.badRequest('Property has no GPS boundary — import survey data first');
  }

  const geometry = property.boundaryGeoJSON as unknown as GeoJSON.Geometry;
  const bounds = turfBbox(geometry) as [number, number, number, number];
  const center = turfCentroid(geometry as GeoJSON.Geometry);
  const [centerLng, centerLat] = center.geometry.coordinates as [number, number];

  return {
    tileUrl: await getSentinel2TileUrl(bounds),
    bbox: bounds,
    centerLat,
    centerLng,
    zoom: calculateZoom(bounds),
  };
}
