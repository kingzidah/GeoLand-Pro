import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Link } from 'react-router-dom';
import maplibregl, { Map as MapLibreMap, Popup } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { area as turfArea, centroid as turfCentroid, distance as turfDistance, polygon as turfPolygon } from '@turf/turf';
import { useMutation } from '@tanstack/react-query';
import { cn } from '@/utils/cn';
import { propertiesApi } from '@/api/properties';
import { getApiError, getAccessToken, onAccessTokenChange } from '@/api/client';
import type { MapPlot, PlotStatus } from '@/types';
import { MapToolbar, type MapMode } from './MapToolbar';
import { LayerControlsPanel, DEFAULT_LAYERS, type LayersState } from './LayerControlsPanel';
import { PlotDetailPanel } from './PlotDetailPanel';
import { DrawPlotForm } from './DrawPlotForm';
import { MiniMap } from './MiniMap';
import type { StatusFilter } from './PlotFilterChips';

// ─── Colour palette ───────────────────────────────────────────────────────────
// Extrusion fill colours (darker, so vertical-gradient reads well)
const EXTRUSION_COLORS: Record<string, string> = {
  VACANT:       '#475569',
  OCCUPIED:     '#0369a1',
  DISPUTED:     '#b91c1c',
  RESERVED:     '#92400e',
  UNDER_SURVEY: '#9a3412',
};

// Glow halo colours (brighter for the neon effect)
const GLOW_COLORS: Record<string, string> = {
  VACANT:       '#94a3b8',
  OCCUPIED:     '#38bdf8',
  DISPUTED:     '#f87171',
  RESERVED:     '#fbbf24',
  UNDER_SURVEY: '#fb923c',
};

// 2D fill colours (for when 3D mode is off)
const FILL_COLORS: Record<string, string> = {
  VACANT:       '#10b981',
  OCCUPIED:     '#3b82f6',
  DISPUTED:     '#ef4444',
  RESERVED:     '#f59e0b',
  UNDER_SURVEY: '#f97316',
};

const VACANT_HIGHLIGHT_COLOR = '#fde047';
const GHANA_PLOT_SQM = 929;

// ─── Tile sources ─────────────────────────────────────────────────────────────
// Sentinel-2 cloudless yearly composite — free, no API key required.
const SENTINEL2_TILE_URL =
  'https://s2maps.eu/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=s2cloudless-2023&STYLE=default&TILEMATRIXSET=PopularWebMercator&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';

// AWS Open Data Terrain Tiles — terrarium encoding, public domain, no key required.
const TERRARIUM_TILE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

// CARTO Dark Matter — free vector basemap, no API key required.
const CARTO_DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

const GHANA_FALLBACK_CENTER: [number, number] = [-1.0232, 7.9465];

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || '/api/v1';

function buildPlotsUrl(pid: string | undefined): string {
  const base = `${API_BASE}/plots/tiles/{z}/{x}/{y}.pbf`;
  return pid ? `${base}?propertyId=${encodeURIComponent(pid)}` : base;
}

interface Props {
  plots: MapPlot[];
  propertyId?: string;
  center?: [number, number];
  propertyBoundary?: GeoJSON.Geometry | null;
  className?: string;
  highlightPlotId?: string;
  statusFilter?: StatusFilter;
  alertPlotIds?: string[];
  onPlotsChanged?: () => void;
  initialLayers?: Partial<LayersState>;
}

export interface Plot3DMapHandle {
  flyToPlot: (plotId: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyFC(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

function propertyBoundaryFC(boundary: GeoJSON.Geometry | null | undefined): GeoJSON.FeatureCollection {
  if (!boundary) return emptyFC();
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: boundary }] };
}

function statusColorExpr(colorMap: Record<string, string>, fallback: string) {
  return [
    'match', ['get', 'status'],
    'VACANT',       colorMap.VACANT,
    'OCCUPIED',     colorMap.OCCUPIED,
    'DISPUTED',     colorMap.DISPUTED,
    'RESERVED',     colorMap.RESERVED,
    'UNDER_SURVEY', colorMap.UNDER_SURVEY,
    fallback,
  ] as unknown as maplibregl.ExpressionSpecification;
}

function plotFillColorExpr(vacantHighlight: boolean) {
  const base = statusColorExpr(FILL_COLORS, '#94a3b8');
  if (!vacantHighlight) return base;
  return ['case', ['==', ['get', 'status'], 'VACANT'], VACANT_HIGHLIGHT_COLOR, base] as unknown as maplibregl.ExpressionSpecification;
}

function plotFillOpacityExpr(highlightPlotId: string | undefined, statusFilter: StatusFilter | undefined) {
  if (statusFilter && statusFilter !== 'ALL') {
    return ['case', ['==', ['get', 'status'], statusFilter], 0.55, 0.05] as unknown as maplibregl.ExpressionSpecification;
  }
  if (highlightPlotId) {
    return ['case', ['==', ['get', 'id'], highlightPlotId], 0.75, 0.12] as unknown as maplibregl.ExpressionSpecification;
  }
  return 0.45;
}

function extrusionOpacityExpr(highlightPlotId: string | undefined, statusFilter: StatusFilter | undefined) {
  if (statusFilter && statusFilter !== 'ALL') {
    return ['case', ['==', ['get', 'status'], statusFilter], 0.9, 0.08] as unknown as maplibregl.ExpressionSpecification;
  }
  if (highlightPlotId) {
    return ['case', ['==', ['get', 'id'], highlightPlotId], 0.95, 0.3] as unknown as maplibregl.ExpressionSpecification;
  }
  return 0.85;
}

function plotCentroid(plot: MapPlot): [number, number] | null {
  if (plot.centroidLng != null && plot.centroidLat != null) return [plot.centroidLng, plot.centroidLat];
  try {
    const c = turfCentroid({ type: 'Feature', properties: {}, geometry: plot.boundaryGeoJSON as GeoJSON.Geometry });
    return c.geometry.coordinates as [number, number];
  } catch {
    return null;
  }
}

function alertZonesFC(plots: MapPlot[], alertPlotIds: string[]): GeoJSON.FeatureCollection {
  const idSet = new Set(alertPlotIds);
  const features: GeoJSON.Feature[] = [];
  for (const plot of plots) {
    if (!idSet.has(plot.id)) continue;
    const coords = plotCentroid(plot);
    if (!coords) continue;
    features.push({ type: 'Feature', properties: { id: plot.id }, geometry: { type: 'Point', coordinates: coords } });
  }
  return { type: 'FeatureCollection', features };
}

function midpoint(a: [number, number], b: [number, number]): [number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${meters.toFixed(1)} m`;
}

function nextPlotNumber(plots: MapPlot[]): string {
  let max = 0;
  let prefix = 'PLT-';
  let digits = 3;
  for (const p of plots) {
    const match = p.plotNumber.match(/^(.*?)(\d+)\s*$/);
    if (!match) continue;
    const num = parseInt(match[2], 10);
    if (num > max) { max = num; prefix = match[1]; digits = match[2].length; }
  }
  return `${prefix}${String(max + 1).padStart(digits, '0')}`;
}

function buildDrawSourceData(points: [number, number][], cursor?: [number, number]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  const linePoints = cursor ? [...points, cursor] : points;
  if (linePoints.length >= 2) {
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: linePoints } });
  }
  if (points.length >= 3) {
    features.push({ type: 'Feature', properties: { fill: true }, geometry: { type: 'Polygon', coordinates: [[...points, points[0]]] } });
  }
  for (const p of points) {
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: p } });
  }
  return { type: 'FeatureCollection', features };
}

function buildMeasurePreview(points: [number, number][], cursor: [number, number] | undefined, mode: MapMode): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];
  const linePoints = cursor ? [...points, cursor] : points;
  if (mode === 'measure-distance' && linePoints.length >= 2) {
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: linePoints.slice(0, 2) } });
  }
  if (mode === 'measure-area') {
    if (linePoints.length >= 2) {
      features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: linePoints } });
    }
    if (points.length >= 3) {
      features.push({ type: 'Feature', properties: { fill: true }, geometry: { type: 'Polygon', coordinates: [[...points, points[0]]] } });
    }
  }
  for (const p of points) {
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: p } });
  }
  return features;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const Plot3DMap = forwardRef<Plot3DMapHandle, Props>(function Plot3DMap(
  { plots, propertyId, center, propertyBoundary, className, highlightPlotId, statusFilter, alertPlotIds, onPlotsChanged, initialLayers },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const tileUrlRef = useRef<string>(buildPlotsUrl(propertyId));

  const modeRef = useRef<MapMode>('view');
  const plotsRef = useRef<MapPlot[]>(plots);
  const drawPointsRef = useRef<[number, number][]>([]);
  const measureDistPointsRef = useRef<[number, number][]>([]);
  const measureAreaPointsRef = useRef<[number, number][]>([]);
  const measureFeaturesRef = useRef<GeoJSON.Feature[]>([]);

  const [mode, setMode] = useState<MapMode>('view');
  const [layers, setLayers] = useState<LayersState>({ ...DEFAULT_LAYERS, ...initialLayers });
  const [layersOpen, setLayersOpen] = useState(false);
  const [selectedPlot, setSelectedPlot] = useState<MapPlot | null>(null);
  const [pendingPlot, setPendingPlot] = useState<{
    geojson: GeoJSON.Polygon;
    areaSqm: number;
    centroid: [number, number];
    plotNumber: string;
  } | null>(null);
  const [liveLabel, setLiveLabel] = useState<string | null>(null);
  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);

  // 3D / terrain state — mutable refs keep the latest value inside closures
  const [is3D, setIs3D] = useState(true);
  const [terrainExaggeration, setTerrainExaggeration] = useState(1.4);
  const is3DRef = useRef(true);
  const terrainExaggerationRef = useRef(1.4);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { plotsRef.current = plots; }, [plots]);
  useEffect(() => { tileUrlRef.current = buildPlotsUrl(propertyId); }, [propertyId]);
  useEffect(() => { is3DRef.current = is3D; }, [is3D]);
  useEffect(() => { terrainExaggerationRef.current = terrainExaggeration; }, [terrainExaggeration]);

  // ─── Map interaction helpers ──────────────────────────────────────────────

  function updateDrawSource(map: MapLibreMap, points: [number, number][], cursor?: [number, number]) {
    (map.getSource('draw') as maplibregl.GeoJSONSource | undefined)?.setData(buildDrawSourceData(points, cursor));
  }

  function refreshMeasureSource(map: MapLibreMap) {
    (map.getSource('measure') as maplibregl.GeoJSONSource | undefined)
      ?.setData({ type: 'FeatureCollection', features: measureFeaturesRef.current });
  }

  function updateMeasurePreview(map: MapLibreMap, cursor?: [number, number]) {
    const source = map.getSource('measure') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    const m = modeRef.current;
    const points = m === 'measure-distance' ? measureDistPointsRef.current : measureAreaPointsRef.current;
    source.setData({ type: 'FeatureCollection', features: [...measureFeaturesRef.current, ...buildMeasurePreview(points, cursor, m)] });
  }

  function finalizeDrawnPlot(map: MapLibreMap) {
    const points = drawPointsRef.current;
    if (points.length < 3) return;
    const ring = [...points, points[0]];
    const poly = turfPolygon([ring]);
    const sqm = turfArea(poly);
    const centroidCoords = turfCentroid(poly).geometry.coordinates as [number, number];
    setPendingPlot({ geojson: poly.geometry, areaSqm: sqm, centroid: centroidCoords, plotNumber: nextPlotNumber(plotsRef.current) });
    setLiveLabel(null);
    setMode('view');
    void map;
  }

  function finalizeMeasureArea(map: MapLibreMap) {
    const points = measureAreaPointsRef.current;
    if (points.length < 3) return;
    const ring = [...points, points[0]];
    const poly = turfPolygon([ring]);
    const sqm = turfArea(poly);
    const plotsCount = (sqm / GHANA_PLOT_SQM).toFixed(2);
    const label = `${Math.round(sqm).toLocaleString()} m² (~${plotsCount} plots)`;
    const centerCoords = turfCentroid(poly).geometry.coordinates as [number, number];
    measureFeaturesRef.current = [
      ...measureFeaturesRef.current,
      { type: 'Feature', properties: { fill: true }, geometry: poly.geometry },
      { type: 'Feature', properties: { label }, geometry: { type: 'Point', coordinates: centerCoords } },
    ];
    measureAreaPointsRef.current = [];
    setLiveLabel(null);
    refreshMeasureSource(map);
  }

  // ─── flyToPlot imperative handle ─────────────────────────────────────────

  useImperativeHandle(ref, () => ({
    flyToPlot: (plotId: string) => {
      const map = mapRef.current;
      const plot = plotsRef.current.find((p) => p.id === plotId);
      if (!map || !plot) return;
      const coords = plotCentroid(plot);
      if (!coords) return;

      map.flyTo({ center: coords, zoom: 19, pitch: 60, essential: true });

      const setHighlight = () => {
        (map.getSource('search-highlight') as maplibregl.GeoJSONSource | undefined)?.setData({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: coords } }],
        });
      };
      if (map.isStyleLoaded()) setHighlight();
      else map.once('load', setHighlight);

      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = setTimeout(() => {
        (map.getSource('search-highlight') as maplibregl.GeoJSONSource | undefined)?.setData(emptyFC());
      }, 5000);

      setSelectedPlot(plot);
      setLayersOpen(false);
    },
  }), []);

  // ─── Map initialisation ───────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const boundaryCentroid = (() => {
      if (!propertyBoundary) return null;
      try {
        return turfCentroid({ type: 'Feature', properties: {}, geometry: propertyBoundary })
          .geometry.coordinates as [number, number];
      } catch { return null; }
    })();

    const initialCenter: [number, number] =
      center ??
      boundaryCentroid ??
      (plots[0]?.centroidLng != null && plots[0]?.centroidLat != null
        ? [plots[0].centroidLng, plots[0].centroidLat]
        : GHANA_FALLBACK_CENTER);

    const map = new maplibregl.Map({
      container: containerRef.current,
      // CARTO Dark Matter — free vector basemap, no API key required.
      style: CARTO_DARK_STYLE,
      center: initialCenter,
      zoom: 16,
      pitch: 60,
      bearing: -20,
      maxPitch: 85,
      transformRequest: (url, resourceType) => {
        if (resourceType === 'Tile' && url.includes('/plots/tiles/')) {
          const token = getAccessToken();
          return { url, headers: token ? { Authorization: `Bearer ${token}` } : {} };
        }
      },
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

    map.on('load', () => {
      // Find the first CARTO symbol layer — we insert our spatial layers below it so
      // basemap labels remain on top of everything except our own plot labels.
      const baseLayers = map.getStyle().layers ?? [];
      const firstSymbolId = baseLayers.find((l) => l.type === 'symbol')?.id;

      // ── Terrain (always-on, no API key required) ──────────────────────────
      map.addSource('terrain', {
        type: 'raster-dem',
        tiles: [TERRARIUM_TILE_URL],
        tileSize: 256,
        encoding: 'terrarium',
        maxzoom: 14,
        attribution: '© Terrain tiles by Mapzen/Amazon, CC0',
      });
      map.setTerrain({ source: 'terrain', exaggeration: terrainExaggerationRef.current });

      // ── Cinematic sky / atmosphere ────────────────────────────────────────
      // MapLibre setSky only — there is no setFog() in MapLibre (Mapbox-only).
      // Cast to any: SkySpecification typings vary across MapLibre minor versions.
      map.setSky({
        'sky-type': 'gradient',
        'sky-color': '#07071a',
        'horizon-color': '#12122a',
        'fog-color': '#0a0a18',
        'fog-ground-blend': 0.5,
        'sky-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0, 8, 0.5, 14, 1],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      // ── Cinematic key light (low-angle, warm, long shadows) ───────────────
      map.setLight({
        anchor: 'map',
        color: '#d4c8a0',
        intensity: 0.45,
        position: [1.5, 215, 65],
      });

      // ── Satellite / Sentinel-2 raster sources (default hidden) ────────────
      map.addSource('satellite', {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        attribution: 'Esri, Maxar, Earthstar Geographics',
      });
      map.addSource('sentinel2', {
        type: 'raster',
        tiles: [SENTINEL2_TILE_URL],
        tileSize: 256,
        attribution: 'Sentinel-2 cloudless — EOX IT Services GmbH',
      });

      const layersState = layers;

      map.addLayer(
        { id: 'satellite', type: 'raster', source: 'satellite',
          layout: { visibility: layersState.satellite ? 'visible' : 'none' } },
        firstSymbolId,
      );
      map.addLayer(
        { id: 'sentinel2', type: 'raster', source: 'sentinel2',
          layout: { visibility: layersState.sentinel2 ? 'visible' : 'none' } },
        firstSymbolId,
      );

      // ── Plots vector tile source ──────────────────────────────────────────
      map.addSource('plots', {
        type: 'vector',
        tiles: [tileUrlRef.current],
        minzoom: 0,
        maxzoom: 22,
        promoteId: 'id',
      });

      // ── Fill-extrusion (3D, default visible) ─────────────────────────────
      // Extrusion height driven by status; disputed plots tower at 28m.
      map.addLayer(
        {
          id: 'plots-extrusion',
          type: 'fill-extrusion',
          source: 'plots',
          'source-layer': 'plots',
          layout: { visibility: 'visible' },
          paint: {
            'fill-extrusion-color': statusColorExpr(EXTRUSION_COLORS, '#374151'),
            'fill-extrusion-height': [
              'match', ['get', 'status'],
              'VACANT',       3,
              'OCCUPIED',     8,
              'RESERVED',     5,
              'UNDER_SURVEY', 6,
              'DISPUTED',     28,
              3,
            ] as unknown as maplibregl.ExpressionSpecification,
            'fill-extrusion-base': 0,
            'fill-extrusion-opacity': extrusionOpacityExpr(highlightPlotId, statusFilter),
            'fill-extrusion-vertical-gradient': true,
          },
        },
        firstSymbolId,
      );

      // ── 2D fill (shown only when 3D is off) ───────────────────────────────
      map.addLayer(
        {
          id: 'plots-fill',
          type: 'fill',
          source: 'plots',
          'source-layer': 'plots',
          layout: { visibility: 'none' },
          paint: {
            'fill-color': plotFillColorExpr(layersState.vacantHighlight),
            'fill-opacity': plotFillOpacityExpr(highlightPlotId, statusFilter),
          },
        },
        firstSymbolId,
      );

      // ── Glowing plot boundary (glow halo + crisp core) ───────────────────
      map.addLayer(
        {
          id: 'plots-outline-glow',
          type: 'line',
          source: 'plots',
          'source-layer': 'plots',
          layout: { visibility: layersState.boundaries ? 'visible' : 'none' },
          paint: {
            'line-color': statusColorExpr(GLOW_COLORS, '#64748b'),
            'line-width': ['match', ['get', 'status'], 'DISPUTED', 10, 5] as unknown as maplibregl.ExpressionSpecification,
            'line-blur':  ['match', ['get', 'status'], 'DISPUTED', 7, 4] as unknown as maplibregl.ExpressionSpecification,
            'line-opacity': ['match', ['get', 'status'], 'DISPUTED', 0.75, 0.55] as unknown as maplibregl.ExpressionSpecification,
          },
        },
        firstSymbolId,
      );
      map.addLayer(
        {
          id: 'plots-outline',
          type: 'line',
          source: 'plots',
          'source-layer': 'plots',
          layout: { visibility: layersState.boundaries ? 'visible' : 'none' },
          paint: {
            'line-color': highlightPlotId
              ? (['case', ['==', ['get', 'id'], highlightPlotId], '#ffffff', statusColorExpr(GLOW_COLORS, '#94a3b8')] as unknown as maplibregl.ExpressionSpecification)
              : statusColorExpr(GLOW_COLORS, '#94a3b8'),
            'line-width': highlightPlotId
              ? (['case', ['==', ['get', 'id'], highlightPlotId], 2.5, 1.2] as unknown as maplibregl.ExpressionSpecification)
              : 1.2,
          },
        },
        firstSymbolId,
      );

      // ── Plot labels ───────────────────────────────────────────────────────
      map.addLayer({
        id: 'plots-labels',
        type: 'symbol',
        source: 'plots',
        'source-layer': 'plots',
        layout: {
          'text-field': ['coalesce', ['get', 'plot_code'], ''],
          'text-font': ['Noto Sans Regular', 'Arial Unicode MS Regular'],
          'text-size': 11,
          visibility: layersState.labels ? 'visible' : 'none',
        },
        paint: { 'text-color': '#f1f5f9', 'text-halo-color': '#0f172a', 'text-halo-width': 1.2 },
      });

      // ── Property boundary (beacon glow + crisp line) ──────────────────────
      map.addSource('property-boundary', {
        type: 'geojson',
        data: propertyBoundaryFC(propertyBoundary),
      });
      map.addLayer(
        {
          id: 'property-boundary-glow',
          type: 'line',
          source: 'property-boundary',
          paint: {
            'line-color': '#00e5ff',
            'line-width': 10,
            'line-blur': 7,
            'line-opacity': 0.55,
          },
        },
        firstSymbolId,
      );
      map.addLayer({
        id: 'property-boundary-line',
        type: 'line',
        source: 'property-boundary',
        paint: {
          'line-color': '#e0f7fa',
          'line-width': 2,
          'line-dasharray': [3, 2],
        },
      });

      // ── Drawing overlay ───────────────────────────────────────────────────
      map.addSource('draw', { type: 'geojson', data: emptyFC() });
      map.addLayer({ id: 'draw-fill', type: 'fill', source: 'draw', filter: ['==', ['get', 'fill'], true],
        paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.2 } });
      map.addLayer({ id: 'draw-line', type: 'line', source: 'draw', filter: ['==', ['geometry-type'], 'LineString'],
        paint: { 'line-color': '#2563eb', 'line-width': 2, 'line-dasharray': [2, 1.5] } });
      map.addLayer({ id: 'draw-points', type: 'circle', source: 'draw', filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-radius': 4, 'circle-color': '#ffffff', 'circle-stroke-color': '#2563eb', 'circle-stroke-width': 2 } });

      // ── Measurement overlay ───────────────────────────────────────────────
      map.addSource('measure', { type: 'geojson', data: emptyFC() });
      map.addLayer({ id: 'measure-fill', type: 'fill', source: 'measure', filter: ['==', ['get', 'fill'], true],
        paint: { 'fill-color': '#f97316', 'fill-opacity': 0.15 } });
      map.addLayer({ id: 'measure-line', type: 'line', source: 'measure', filter: ['==', ['geometry-type'], 'LineString'],
        paint: { 'line-color': '#f97316', 'line-width': 2 } });
      map.addLayer({ id: 'measure-points', type: 'circle', source: 'measure',
        filter: ['all', ['==', ['geometry-type'], 'Point'], ['!', ['has', 'label']]],
        paint: { 'circle-radius': 3, 'circle-color': '#f97316' } });
      map.addLayer({
        id: 'measure-labels', type: 'symbol', source: 'measure', filter: ['has', 'label'],
        layout: { 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Regular', 'Arial Unicode MS Regular'],
          'text-size': 12, 'text-offset': [0, -1] },
        paint: { 'text-color': '#fed7aa', 'text-halo-color': '#0f172a', 'text-halo-width': 1.5 },
      });

      // ── Alert zones ───────────────────────────────────────────────────────
      map.addSource('alert-zones', {
        type: 'geojson',
        data: alertZonesFC(plotsRef.current, alertPlotIds ?? []),
      });
      map.addLayer({
        id: 'alert-zones-circle', type: 'circle', source: 'alert-zones',
        layout: { visibility: layersState.alertZones ? 'visible' : 'none' },
        paint: { 'circle-radius': 12, 'circle-color': '#ef4444', 'circle-opacity': 0.4,
          'circle-stroke-color': '#ef4444', 'circle-stroke-width': 2 },
      });

      // ── Search highlight ──────────────────────────────────────────────────
      map.addSource('search-highlight', { type: 'geojson', data: emptyFC() });
      map.addLayer({
        id: 'search-highlight-circle', type: 'circle', source: 'search-highlight',
        paint: { 'circle-radius': 14, 'circle-color': '#facc15', 'circle-opacity': 0.5,
          'circle-stroke-color': '#eab308', 'circle-stroke-width': 2 },
      });

      // ── Event handlers ────────────────────────────────────────────────────

      map.on('mouseenter', 'plots-fill', (e) => {
        if (modeRef.current !== 'view') return;
        map.getCanvas().style.cursor = 'pointer';
        const feature = e.features?.[0];
        if (!feature || !popupRef.current) return;
        const { plot_code, status, area_sqm } = feature.properties as { plot_code: string; status: string; area_sqm: number };
        popupRef.current.setLngLat(e.lngLat)
          .setHTML(`<strong>${plot_code}</strong><br/>Status: ${status}<br/>Area: ${Math.round(area_sqm).toLocaleString()} m²`)
          .addTo(map);
      });

      map.on('mouseenter', 'plots-extrusion', (e) => {
        if (modeRef.current !== 'view') return;
        map.getCanvas().style.cursor = 'pointer';
        const feature = e.features?.[0];
        if (!feature || !popupRef.current) return;
        const { plot_code, status, area_sqm } = feature.properties as { plot_code: string; status: string; area_sqm: number };
        popupRef.current.setLngLat(e.lngLat)
          .setHTML(`<strong>${plot_code}</strong><br/>Status: ${status}<br/>Area: ${Math.round(area_sqm).toLocaleString()} m²`)
          .addTo(map);
      });

      map.on('mousemove', 'plots-fill', (e) => {
        if (modeRef.current !== 'view') return;
        if (popupRef.current && e.lngLat) popupRef.current.setLngLat(e.lngLat);
      });
      map.on('mousemove', 'plots-extrusion', (e) => {
        if (modeRef.current !== 'view') return;
        if (popupRef.current && e.lngLat) popupRef.current.setLngLat(e.lngLat);
      });

      map.on('mouseleave', 'plots-fill', () => {
        map.getCanvas().style.cursor = modeRef.current === 'view' ? '' : 'crosshair';
        popupRef.current?.remove();
      });
      map.on('mouseleave', 'plots-extrusion', () => {
        map.getCanvas().style.cursor = modeRef.current === 'view' ? '' : 'crosshair';
        popupRef.current?.remove();
      });

      map.on('click', (e) => {
        const m = modeRef.current;
        const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];

        if (m === 'view') {
          // Query both layers — extrusion layer is hit in 3D mode
          const extFeatures = map.queryRenderedFeatures(e.point, { layers: ['plots-extrusion'] });
          const fillFeatures = map.queryRenderedFeatures(e.point, { layers: ['plots-fill'] });
          const features = extFeatures.length ? extFeatures : fillFeatures;
          if (features.length > 0) {
            const id = features[0].properties?.id as string;
            const plot = plotsRef.current.find((p) => p.id === id) ?? null;
            setSelectedPlot(plot);
            setLayersOpen(false);
          } else {
            setSelectedPlot(null);
          }
          return;
        }

        if (m === 'draw-plot') {
          drawPointsRef.current = [...drawPointsRef.current, lngLat];
          updateDrawSource(map, drawPointsRef.current);
          if (drawPointsRef.current.length >= 3) {
            const ring = [...drawPointsRef.current, drawPointsRef.current[0]];
            setLiveLabel(`${Math.round(turfArea(turfPolygon([ring]))).toLocaleString()} m²`);
          } else {
            setLiveLabel(null);
          }
          return;
        }

        if (m === 'measure-distance') {
          measureDistPointsRef.current = [...measureDistPointsRef.current, lngLat];
          if (measureDistPointsRef.current.length >= 2) {
            const [a, b] = measureDistPointsRef.current;
            const meters = turfDistance(a, b, { units: 'kilometers' }) * 1000;
            measureFeaturesRef.current = [
              ...measureFeaturesRef.current,
              { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [a, b] } },
              { type: 'Feature', properties: { label: formatDistance(meters) }, geometry: { type: 'Point', coordinates: midpoint(a, b) } },
            ];
            measureDistPointsRef.current = [];
            setLiveLabel(null);
            refreshMeasureSource(map);
          } else {
            setLiveLabel('Click second point…');
            updateMeasurePreview(map);
          }
          return;
        }

        if (m === 'measure-area') {
          measureAreaPointsRef.current = [...measureAreaPointsRef.current, lngLat];
          if (measureAreaPointsRef.current.length >= 3) {
            const ring = [...measureAreaPointsRef.current, measureAreaPointsRef.current[0]];
            const sqm = turfArea(turfPolygon([ring]));
            const plotsCount = (sqm / GHANA_PLOT_SQM).toFixed(2);
            setLiveLabel(`${Math.round(sqm).toLocaleString()} m² (~${plotsCount} plots)`);
          }
          updateMeasurePreview(map);
          return;
        }
      });

      map.on('dblclick', (e) => {
        const m = modeRef.current;
        if (m === 'draw-plot' && drawPointsRef.current.length >= 3) {
          e.preventDefault();
          finalizeDrawnPlot(map);
        } else if (m === 'measure-area' && measureAreaPointsRef.current.length >= 3) {
          e.preventDefault();
          finalizeMeasureArea(map);
        }
      });

      map.on('mousemove', (e) => {
        const m = modeRef.current;
        const cursor: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        if (m === 'draw-plot' && drawPointsRef.current.length > 0) {
          updateDrawSource(map, drawPointsRef.current, cursor);
        } else if (m === 'measure-distance' && measureDistPointsRef.current.length > 0) {
          updateMeasurePreview(map, cursor);
        } else if (m === 'measure-area' && measureAreaPointsRef.current.length > 0) {
          updateMeasurePreview(map, cursor);
        }
      });

      setMapInstance(map);
    });

    mapRef.current = map;

    return () => {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
      setMapInstance(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── 2D / 3D toggle ──────────────────────────────────────────────────────

  const handleToggle3D = () => {
    const map = mapRef.current;
    const next = !is3DRef.current;
    setIs3D(next);
    if (!map || !map.isStyleLoaded()) return;

    map.easeTo({ pitch: next ? 60 : 0, duration: 800 });

    if (next) {
      map.setTerrain({ source: 'terrain', exaggeration: terrainExaggerationRef.current });
      if (map.getLayer('plots-extrusion')) map.setLayoutProperty('plots-extrusion', 'visibility', 'visible');
      if (map.getLayer('plots-fill'))      map.setLayoutProperty('plots-fill',      'visibility', 'none');
    } else {
      map.setTerrain(null);
      if (map.getLayer('plots-extrusion')) map.setLayoutProperty('plots-extrusion', 'visibility', 'none');
      if (map.getLayer('plots-fill'))      map.setLayoutProperty('plots-fill',      'visibility', 'visible');
    }
  };

  // Terrain exaggeration slider
  const handleExaggerationChange = (v: number) => {
    setTerrainExaggeration(v);
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !is3DRef.current) return;
    map.setTerrain({ source: 'terrain', exaggeration: v });
  };

  // Satellite (sentinel2) quick toggle from toolbar
  const handleToggleSatellite = () => {
    setLayers((prev) => ({ ...prev, sentinel2: !prev.sentinel2 }));
  };

  // ─── Styling reactive effects ────────────────────────────────────────────

  // Status / highlight / filter driven styling
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (map.getLayer('plots-extrusion')) {
        map.setPaintProperty('plots-extrusion', 'fill-extrusion-opacity', extrusionOpacityExpr(highlightPlotId, statusFilter));
      }
      if (map.getLayer('plots-fill')) {
        map.setPaintProperty('plots-fill', 'fill-color', plotFillColorExpr(layers.vacantHighlight));
        map.setPaintProperty('plots-fill', 'fill-opacity', plotFillOpacityExpr(highlightPlotId, statusFilter));
      }
      if (map.getLayer('plots-outline')) {
        map.setPaintProperty('plots-outline', 'line-color',
          highlightPlotId
            ? (['case', ['==', ['get', 'id'], highlightPlotId], '#ffffff', statusColorExpr(GLOW_COLORS, '#94a3b8')] as unknown as maplibregl.ExpressionSpecification)
            : statusColorExpr(GLOW_COLORS, '#94a3b8'));
        map.setPaintProperty('plots-outline', 'line-width',
          highlightPlotId
            ? (['case', ['==', ['get', 'id'], highlightPlotId], 2.5, 1.2] as unknown as maplibregl.ExpressionSpecification)
            : 1.2);
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [highlightPlotId, statusFilter, layers.vacantHighlight]);

  // Layer visibility toggles
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (map.getLayer('satellite'))           map.setLayoutProperty('satellite',           'visibility', layers.satellite  ? 'visible' : 'none');
      if (map.getLayer('sentinel2'))           map.setLayoutProperty('sentinel2',           'visibility', layers.sentinel2  ? 'visible' : 'none');
      if (map.getLayer('plots-outline-glow'))  map.setLayoutProperty('plots-outline-glow',  'visibility', layers.boundaries ? 'visible' : 'none');
      if (map.getLayer('plots-outline'))       map.setLayoutProperty('plots-outline',       'visibility', layers.boundaries ? 'visible' : 'none');
      if (map.getLayer('plots-labels'))        map.setLayoutProperty('plots-labels',        'visibility', layers.labels     ? 'visible' : 'none');
      if (map.getLayer('alert-zones-circle'))  map.setLayoutProperty('alert-zones-circle',  'visibility', layers.alertZones ? 'visible' : 'none');
    };
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [layers.satellite, layers.sentinel2, layers.boundaries, layers.labels, layers.alertZones]);

  // Recenter on property switch
  const didMountRef = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!didMountRef.current) { didMountRef.current = true; return; }

    let target: [number, number] | null = center ?? null;
    if (!target && propertyBoundary) {
      try {
        target = turfCentroid({ type: 'Feature', properties: {}, geometry: propertyBoundary }).geometry.coordinates as [number, number];
      } catch { target = null; }
    }
    if (!target) target = GHANA_FALLBACK_CENTER;
    map.flyTo({ center: target, zoom: 16, pitch: 60, bearing: -20, essential: true });
    (map.getSource('plots') as maplibregl.VectorTileSource | undefined)?.setTiles([tileUrlRef.current]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  // Property boundary source data
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      (map.getSource('property-boundary') as maplibregl.GeoJSONSource | undefined)?.setData(propertyBoundaryFC(propertyBoundary));
    };
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [propertyBoundary]);

  // Alert zone source data
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      (map.getSource('alert-zones') as maplibregl.GeoJSONSource | undefined)?.setData(alertZonesFC(plots, alertPlotIds ?? []));
    };
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [plots, alertPlotIds]);

  // Cursor style
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = mode === 'view' ? '' : 'crosshair';
  }, [mode]);

  // Token rotation: flush MVT tile cache when access token rotates
  useEffect(() => {
    const unsubscribe = onAccessTokenChange(() => {
      const map = mapRef.current;
      if (!map || !map.isStyleLoaded()) return;
      (map.getSource('plots') as maplibregl.VectorTileSource | undefined)?.setTiles([tileUrlRef.current]);
    });
    return unsubscribe;
  }, []);

  // Pulsing animation for alert zones + search highlight.
  // Uses setInterval capped at ~12.5fps (80ms) instead of rAF to keep
  // setPaintProperty calls well below the 60fps/~480 calls-per-sec rate
  // the previous rAF loop was generating (F. performance fix).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapInstance) return;

    const tick = () => {
      const t1 = Date.now() / 500;
      if (map.getLayer('alert-zones-circle')) {
        map.setPaintProperty('alert-zones-circle', 'circle-radius',  10 + Math.sin(t1) * 5);
        map.setPaintProperty('alert-zones-circle', 'circle-opacity', 0.25 + ((Math.sin(t1) + 1) / 2) * 0.35);
      }
      const t2 = Date.now() / 350;
      if (map.getLayer('search-highlight-circle')) {
        map.setPaintProperty('search-highlight-circle', 'circle-radius',  12 + Math.sin(t2) * 8);
        map.setPaintProperty('search-highlight-circle', 'circle-opacity', 0.3 + ((Math.sin(t2) + 1) / 2) * 0.4);
      }
    };
    const id = setInterval(tick, 80);
    return () => clearInterval(id);
  }, [mapInstance]);

  // ─── Mode / interaction handlers ─────────────────────────────────────────

  const handleModeChange = (newMode: MapMode) => {
    drawPointsRef.current = [];
    measureDistPointsRef.current = [];
    measureAreaPointsRef.current = [];
    setLiveLabel(null);
    const map = mapRef.current;
    if (map) { updateDrawSource(map, []); refreshMeasureSource(map); }
    setSelectedPlot(null);
    setLayersOpen(false);
    setMode(newMode);
  };

  const handleClearMeasurements = () => {
    measureFeaturesRef.current = [];
    measureDistPointsRef.current = [];
    measureAreaPointsRef.current = [];
    setLiveLabel(null);
    const map = mapRef.current;
    if (map) refreshMeasureSource(map);
  };

  const handleToggleLayers = () => {
    setLayersOpen((v) => !v);
    setSelectedPlot(null);
  };

  const createPlotMutation = useMutation({
    mutationFn: async (data: { status: PlotStatus; description?: string }) => {
      if (!propertyId || !pendingPlot) throw new Error('Missing plot data');
      const plot = await propertiesApi.createPlot(propertyId, {
        plotNumber: pendingPlot.plotNumber,
        areaSqm: pendingPlot.areaSqm,
        boundaryGeoJSON: pendingPlot.geojson,
        centroidLat: pendingPlot.centroid[1],
        centroidLng: pendingPlot.centroid[0],
        description: data.description,
      });
      if (data.status !== 'VACANT') {
        try { await propertiesApi.updatePlotStatus(propertyId, plot.id, data.status); } catch { /* best-effort */ }
      }
      return plot;
    },
    onSuccess: () => {
      drawPointsRef.current = [];
      setPendingPlot(null);
      const map = mapRef.current;
      if (map) updateDrawSource(map, []);
      onPlotsChanged?.();
    },
  });

  const handleCancelDraw = () => {
    drawPointsRef.current = [];
    setPendingPlot(null);
    const map = mapRef.current;
    if (map) updateDrawSource(map, []);
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className={cn('relative', className ?? 'h-[32rem] w-full rounded-lg')}>
      <div ref={containerRef} className="absolute inset-0 rounded-lg overflow-hidden" />

      <MapToolbar
        mode={mode}
        onModeChange={handleModeChange}
        onClearMeasurements={handleClearMeasurements}
        onToggleLayers={handleToggleLayers}
        layersOpen={layersOpen}
        liveLabel={liveLabel}
        is3D={is3D}
        onToggle3D={handleToggle3D}
        satelliteOn={layers.sentinel2}
        onToggleSatellite={handleToggleSatellite}
      />

      {layersOpen && (
        <LayerControlsPanel
          layers={layers}
          onChange={setLayers}
          onClose={() => setLayersOpen(false)}
          terrainExaggeration={terrainExaggeration}
          onTerrainExaggerationChange={handleExaggerationChange}
          is3D={is3D}
        />
      )}

      {selectedPlot && !pendingPlot && <PlotDetailPanel plot={selectedPlot} onClose={() => setSelectedPlot(null)} />}

      {pendingPlot && (
        <DrawPlotForm
          plotNumber={pendingPlot.plotNumber}
          areaSqm={pendingPlot.areaSqm}
          saving={createPlotMutation.isPending}
          error={createPlotMutation.error ? getApiError(createPlotMutation.error) : undefined}
          onCancel={handleCancelDraw}
          onSave={(data) => createPlotMutation.mutate(data)}
        />
      )}

      {plots.length > 0 && <MiniMap plots={plots} mainMap={mapInstance} />}

      {plots.length === 0 && !propertyBoundary && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/40 rounded-lg pointer-events-none">
          <div className="bg-white rounded-xl shadow-xl px-6 py-5 max-w-sm text-center pointer-events-auto">
            <p className="text-sm font-semibold text-slate-900">No survey data yet</p>
            <p className="text-sm text-slate-500 mt-1">Import GPS coordinates to activate the satellite map</p>
            <Link to="/survey" className="inline-block mt-3 text-sm font-medium text-brand-600 hover:text-brand-700">
              Go to Survey →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
});
