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

const STATUS_COLORS: Record<string, string> = {
  VACANT: '#10b981',
  OCCUPIED: '#3b82f6',
  DISPUTED: '#ef4444',
  RESERVED: '#f59e0b',
  UNDER_SURVEY: '#f97316',
};

const VACANT_HIGHLIGHT_COLOR = '#fde047';
const GHANA_PLOT_SQM = 929; // ~100ft x 100ft "standard plot" commonly used in Ghana

// Sentinel-2 cloudless yearly composite — free XYZ tiles, no API key required.
const SENTINEL2_TILE_URL =
  'https://s2maps.eu/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=s2cloudless-2023&STYLE=default&TILEMATRIXSET=PopularWebMercator&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';

// Geographic center of Ghana — used as a last-resort fallback when a property
// has neither plots nor a surveyed boundary yet.
const GHANA_FALLBACK_CENTER: [number, number] = [-1.0232, 7.9465];

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY as string | undefined;

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || '/api/v1';

function buildPlotsUrl(pid: string | undefined): string {
  const base = `${API_BASE}/plots/tiles/{z}/{x}/{y}.pbf`;
  return pid ? `${base}?propertyId=${encodeURIComponent(pid)}` : base;
}

interface Props {
  plots: MapPlot[];
  propertyId?: string;
  center?: [number, number]; // [lng, lat]
  /** Outer property survey boundary — drawn as a thick white dashed line */
  propertyBoundary?: GeoJSON.Geometry | null;
  className?: string;
  /** Plot ID to highlight in vivid color; all others are dimmed ("locked" look) */
  highlightPlotId?: string;
  statusFilter?: StatusFilter;
  /** Plot IDs that have active GeofenceAlerts — rendered as pulsing red zones when the layer is on */
  alertPlotIds?: string[];
  onPlotsChanged?: () => void;
  /** Overrides for the initial Layers panel state (merged with DEFAULT_LAYERS) */
  initialLayers?: Partial<LayersState>;
}

export interface Plot3DMapHandle {
  flyToPlot: (plotId: string) => void;
}

function emptyFC(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

function propertyBoundaryFeatureCollection(boundary: GeoJSON.Geometry | null | undefined): GeoJSON.FeatureCollection {
  if (!boundary) return emptyFC();
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: boundary }] };
}


function plotFillColorExpr(vacantHighlight: boolean) {
  const statusMatch = [
    'match',
    ['get', 'status'],
    'VACANT', STATUS_COLORS.VACANT,
    'OCCUPIED', STATUS_COLORS.OCCUPIED,
    'DISPUTED', STATUS_COLORS.DISPUTED,
    'RESERVED', STATUS_COLORS.RESERVED,
    'UNDER_SURVEY', STATUS_COLORS.UNDER_SURVEY,
    '#94a3b8',
  ];
  if (!vacantHighlight) return statusMatch as unknown as maplibregl.ExpressionSpecification;
  return ['case', ['==', ['get', 'status'], 'VACANT'], VACANT_HIGHLIGHT_COLOR, statusMatch] as unknown as maplibregl.ExpressionSpecification;
}

function plotFillOpacityExpr(highlightPlotId: string | undefined, statusFilter: StatusFilter | undefined) {
  if (statusFilter && statusFilter !== 'ALL') {
    return ['case', ['==', ['get', 'status'], statusFilter], 0.55, 0.05] as unknown as maplibregl.ExpressionSpecification;
  }
  if (highlightPlotId) {
    return ['case', ['==', ['get', 'id'], highlightPlotId], 0.75, 0.12] as unknown as maplibregl.ExpressionSpecification;
  }
  return 0.35;
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

function alertZonesFeatureCollection(plots: MapPlot[], alertPlotIds: string[]): GeoJSON.FeatureCollection {
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
    if (num > max) {
      max = num;
      prefix = match[1];
      digits = match[2].length;
    }
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

export const Plot3DMap = forwardRef<Plot3DMapHandle, Props>(function Plot3DMap(
  { plots, propertyId, center, propertyBoundary, className, highlightPlotId, statusFilter, alertPlotIds, onPlotsChanged, initialLayers },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  // Tracks the current tile URL so token-rotation and property-switch effects
  // can call src.setTiles([tileUrlRef.current]) without a stale closure.
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

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    plotsRef.current = plots;
  }, [plots]);

  useEffect(() => {
    tileUrlRef.current = buildPlotsUrl(propertyId);
  }, [propertyId]);

  function updateDrawSource(map: MapLibreMap, points: [number, number][], cursor?: [number, number]) {
    const source = map.getSource('draw') as maplibregl.GeoJSONSource | undefined;
    source?.setData(buildDrawSourceData(points, cursor));
  }

  function refreshMeasureSource(map: MapLibreMap) {
    const source = map.getSource('measure') as maplibregl.GeoJSONSource | undefined;
    source?.setData({ type: 'FeatureCollection', features: measureFeaturesRef.current });
  }

  function updateMeasurePreview(map: MapLibreMap, cursor?: [number, number]) {
    const source = map.getSource('measure') as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    const m = modeRef.current;
    const points = m === 'measure-distance' ? measureDistPointsRef.current : measureAreaPointsRef.current;
    const preview = buildMeasurePreview(points, cursor, m);
    source.setData({ type: 'FeatureCollection', features: [...measureFeaturesRef.current, ...preview] });
  }

  function finalizeDrawnPlot(map: MapLibreMap) {
    const points = drawPointsRef.current;
    if (points.length < 3) return;
    const ring = [...points, points[0]];
    const poly = turfPolygon([ring]);
    const sqm = turfArea(poly);
    const centroidCoords = turfCentroid(poly).geometry.coordinates as [number, number];
    setPendingPlot({
      geojson: poly.geometry,
      areaSqm: sqm,
      centroid: centroidCoords,
      plotNumber: nextPlotNumber(plotsRef.current),
    });
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

  useImperativeHandle(
    ref,
    () => ({
      flyToPlot: (plotId: string) => {
        const map = mapRef.current;
        const plot = plotsRef.current.find((p) => p.id === plotId);
        if (!map || !plot) return;
        const coords = plotCentroid(plot);
        if (!coords) return;

        map.flyTo({ center: coords, zoom: 19, pitch: 60, essential: true });

        const setHighlight = () => {
          const source = map.getSource('search-highlight') as maplibregl.GeoJSONSource | undefined;
          source?.setData({
            type: 'FeatureCollection',
            features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: coords } }],
          });
        };
        if (map.isStyleLoaded()) setHighlight();
        else map.once('load', setHighlight);

        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = setTimeout(() => {
          const source = map.getSource('search-highlight') as maplibregl.GeoJSONSource | undefined;
          source?.setData(emptyFC());
        }, 5000);

        setSelectedPlot(plot);
        setLayersOpen(false);
      },
    }),
    []
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const boundaryCentroid = (() => {
      if (!propertyBoundary) return null;
      try {
        return turfCentroid({ type: 'Feature', properties: {}, geometry: propertyBoundary }).geometry
          .coordinates as [number, number];
      } catch {
        return null;
      }
    })();

    const initialCenter: [number, number] =
      center ??
      boundaryCentroid ??
      (plots[0]?.centroidLng != null && plots[0]?.centroidLat != null
        ? [plots[0].centroidLng, plots[0].centroidLat]
        : GHANA_FALLBACK_CENTER);

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          satellite: {
            type: 'raster',
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            ],
            tileSize: 256,
            attribution: 'Esri, Maxar, Earthstar Geographics',
          },
          sentinel2: {
            type: 'raster',
            tiles: [SENTINEL2_TILE_URL],
            tileSize: 256,
            attribution: 'Sentinel-2 cloudless — EOX IT Services GmbH',
          },
          ...(MAPTILER_KEY && {
            terrain: {
              type: 'raster-dem',
              tiles: [`https://api.maptiler.com/tiles/terrain-rgb-v2/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`],
              tileSize: 256,
              encoding: 'mapbox',
              attribution: '© MapTiler',
              maxzoom: 14,
            },
          }),
        },
        layers: [
          {
            id: 'satellite',
            type: 'raster',
            source: 'satellite',
            layout: { visibility: layers.satellite ? 'visible' : 'none' },
          },
          {
            id: 'sentinel2',
            type: 'raster',
            source: 'sentinel2',
            layout: { visibility: layers.sentinel2 ? 'visible' : 'none' },
          },
        ],
        ...(MAPTILER_KEY && {
          terrain: { source: 'terrain', exaggeration: 1.4 },
          sky: {
            'sky-color': '#87ceeb',
            'horizon-color': '#dde8f0',
            'fog-color': '#ffffff',
            'fog-ground-blend': 0.5,
          },
        }),
      },
      center: initialCenter,
      zoom: 16,
      pitch: 60,
      bearing: -20,
      maxPitch: 85,
      // Inject Bearer token on every MVT tile fetch (ADR-AUTH-001 — tiles are
      // behind requireAuth; token is read at call time so silent refresh works).
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
      // Vector tile source — geometry is served by PostGIS ST_AsMVT (ADR-MAP-007/008).
      // The `plots` prop is still passed by parents and used for flyToPlot, draw
      // mode, alert zones, and MiniMap — but polygon rendering comes from tiles.
      map.addSource('plots', {
        type: 'vector',
        tiles: [tileUrlRef.current],
        minzoom: 0,
        maxzoom: 22,
        promoteId: 'id',
      });

      map.addLayer({
        id: 'plots-fill',
        type: 'fill',
        source: 'plots',
        'source-layer': 'plots',
        paint: {
          'fill-color': plotFillColorExpr(layers.vacantHighlight),
          'fill-opacity': plotFillOpacityExpr(highlightPlotId, statusFilter),
        },
      });

      map.addLayer({
        id: 'plots-outline',
        type: 'line',
        source: 'plots',
        'source-layer': 'plots',
        layout: { visibility: layers.boundaries ? 'visible' : 'none' },
        paint: {
          'line-color': highlightPlotId
            ? (['case', ['==', ['get', 'id'], highlightPlotId], '#ffffff', '#475569'] as unknown as maplibregl.ExpressionSpecification)
            : '#ffffff',
          'line-width': highlightPlotId
            ? (['case', ['==', ['get', 'id'], highlightPlotId], 3, 1] as unknown as maplibregl.ExpressionSpecification)
            : 1.5,
        },
      });

      map.addLayer({
        id: 'plots-labels',
        type: 'symbol',
        source: 'plots',
        'source-layer': 'plots',
        layout: {
          // MVT exposes plotNumber as plot_code (controller line 65)
          'text-field': ['coalesce', ['get', 'plot_code'], ''],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          visibility: layers.labels ? 'visible' : 'none',
        },
        paint: { 'text-color': '#1e293b', 'text-halo-color': '#ffffff', 'text-halo-width': 1.2 },
      });

      // Outer property survey boundary (full perimeter)
      map.addSource('property-boundary', {
        type: 'geojson',
        data: propertyBoundaryFeatureCollection(propertyBoundary),
      });
      map.addLayer({
        id: 'property-boundary-line',
        type: 'line',
        source: 'property-boundary',
        paint: {
          'line-color': '#ffffff',
          'line-width': 4,
          'line-dasharray': [3, 2],
        },
      });

      // Drawing overlay (in-progress new plot)
      map.addSource('draw', { type: 'geojson', data: emptyFC() });
      map.addLayer({
        id: 'draw-fill',
        type: 'fill',
        source: 'draw',
        filter: ['==', ['get', 'fill'], true],
        paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.2 },
      });
      map.addLayer({
        id: 'draw-line',
        type: 'line',
        source: 'draw',
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: { 'line-color': '#2563eb', 'line-width': 2, 'line-dasharray': [2, 1.5] },
      });
      map.addLayer({
        id: 'draw-points',
        type: 'circle',
        source: 'draw',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-radius': 4, 'circle-color': '#ffffff', 'circle-stroke-color': '#2563eb', 'circle-stroke-width': 2 },
      });

      // Measurement overlay
      map.addSource('measure', { type: 'geojson', data: emptyFC() });
      map.addLayer({
        id: 'measure-fill',
        type: 'fill',
        source: 'measure',
        filter: ['==', ['get', 'fill'], true],
        paint: { 'fill-color': '#f97316', 'fill-opacity': 0.15 },
      });
      map.addLayer({
        id: 'measure-line',
        type: 'line',
        source: 'measure',
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: { 'line-color': '#f97316', 'line-width': 2 },
      });
      map.addLayer({
        id: 'measure-points',
        type: 'circle',
        source: 'measure',
        filter: ['all', ['==', ['geometry-type'], 'Point'], ['!', ['has', 'label']]],
        paint: { 'circle-radius': 3, 'circle-color': '#f97316' },
      });
      map.addLayer({
        id: 'measure-labels',
        type: 'symbol',
        source: 'measure',
        filter: ['has', 'label'],
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
          'text-offset': [0, -1],
        },
        paint: { 'text-color': '#9a3412', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
      });

      // Alert zones (pulsing red circles for plots with active GeofenceAlerts)
      map.addSource('alert-zones', {
        type: 'geojson',
        data: alertZonesFeatureCollection(plotsRef.current, alertPlotIds ?? []),
      });
      map.addLayer({
        id: 'alert-zones-circle',
        type: 'circle',
        source: 'alert-zones',
        layout: { visibility: layers.alertZones ? 'visible' : 'none' },
        paint: {
          'circle-radius': 12,
          'circle-color': '#ef4444',
          'circle-opacity': 0.4,
          'circle-stroke-color': '#ef4444',
          'circle-stroke-width': 2,
        },
      });

      // Search result highlight
      map.addSource('search-highlight', { type: 'geojson', data: emptyFC() });
      map.addLayer({
        id: 'search-highlight-circle',
        type: 'circle',
        source: 'search-highlight',
        paint: {
          'circle-radius': 14,
          'circle-color': '#facc15',
          'circle-opacity': 0.5,
          'circle-stroke-color': '#eab308',
          'circle-stroke-width': 2,
        },
      });

      map.on('mouseenter', 'plots-fill', (e) => {
        if (modeRef.current !== 'view') return;
        map.getCanvas().style.cursor = 'pointer';
        const feature = e.features?.[0];
        if (!feature || !popupRef.current) return;
        // MVT property names: plot_code (was plotNumber), area_sqm (was areaSqm)
        const { plot_code, status, area_sqm } = feature.properties as {
          plot_code: string;
          status: string;
          area_sqm: number;
        };
        popupRef.current
          .setLngLat(e.lngLat)
          .setHTML(
            `<strong>${plot_code}</strong><br/>Status: ${status}<br/>Area: ${Math.round(area_sqm).toLocaleString()} m²`
          )
          .addTo(map);
      });

      map.on('mousemove', 'plots-fill', (e) => {
        if (modeRef.current !== 'view') return;
        if (popupRef.current && e.lngLat) popupRef.current.setLngLat(e.lngLat);
      });

      map.on('mouseleave', 'plots-fill', () => {
        map.getCanvas().style.cursor = modeRef.current === 'view' ? '' : 'crosshair';
        popupRef.current?.remove();
      });

      map.on('click', (e) => {
        const m = modeRef.current;
        const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];

        if (m === 'view') {
          const features = map.queryRenderedFeatures(e.point, { layers: ['plots-fill'] });
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
            const sqm = turfArea(turfPolygon([ring]));
            setLiveLabel(`${Math.round(sqm).toLocaleString()} m²`);
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
            const label = formatDistance(meters);
            measureFeaturesRef.current = [
              ...measureFeaturesRef.current,
              { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [a, b] } },
              { type: 'Feature', properties: { label }, geometry: { type: 'Point', coordinates: midpoint(a, b) } },
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

  // Update status/highlight/filter-driven styling without re-creating the map.
  // Plot geometry is now served by the MVT vector source — no setData needed.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      if (map.getLayer('plots-fill')) {
        map.setPaintProperty('plots-fill', 'fill-color', plotFillColorExpr(layers.vacantHighlight));
        map.setPaintProperty('plots-fill', 'fill-opacity', plotFillOpacityExpr(highlightPlotId, statusFilter));
      }
      if (map.getLayer('plots-outline')) {
        map.setPaintProperty(
          'plots-outline',
          'line-color',
          highlightPlotId
            ? (['case', ['==', ['get', 'id'], highlightPlotId], '#ffffff', '#475569'] as unknown as maplibregl.ExpressionSpecification)
            : '#ffffff'
        );
        map.setPaintProperty(
          'plots-outline',
          'line-width',
          highlightPlotId
            ? (['case', ['==', ['get', 'id'], highlightPlotId], 3, 1] as unknown as maplibregl.ExpressionSpecification)
            : 1.5
        );
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
      if (map.getLayer('satellite')) map.setLayoutProperty('satellite', 'visibility', layers.satellite ? 'visible' : 'none');
      if (map.getLayer('sentinel2')) map.setLayoutProperty('sentinel2', 'visibility', layers.sentinel2 ? 'visible' : 'none');
      if (map.getLayer('plots-outline')) map.setLayoutProperty('plots-outline', 'visibility', layers.boundaries ? 'visible' : 'none');
      if (map.getLayer('plots-labels')) map.setLayoutProperty('plots-labels', 'visibility', layers.labels ? 'visible' : 'none');
      if (map.getLayer('alert-zones-circle')) map.setLayoutProperty('alert-zones-circle', 'visibility', layers.alertZones ? 'visible' : 'none');
    };

    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [layers.satellite, layers.sentinel2, layers.boundaries, layers.labels, layers.alertZones]);

  // Recenter the map when switching to a different property (skip the initial mount,
  // which already centers via the initialCenter calculation above).
  const didMountRef = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }

    let target: [number, number] | null = center ?? null;
    if (!target && propertyBoundary) {
      try {
        target = turfCentroid({ type: 'Feature', properties: {}, geometry: propertyBoundary }).geometry
          .coordinates as [number, number];
      } catch {
        target = null;
      }
    }
    if (!target) target = GHANA_FALLBACK_CENTER;

    map.flyTo({ center: target, zoom: 16, pitch: 60, bearing: -20, essential: true });

    // Swap the vector tile source so cached tiles for the old property are
    // dropped and re-fetched for the new one. tileUrlRef is already updated
    // by the tileUrl sync effect (runs before this effect in the same render).
    const src = map.getSource('plots') as maplibregl.VectorTileSource | undefined;
    src?.setTiles([tileUrlRef.current]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  // Property boundary source data
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const source = map.getSource('property-boundary') as maplibregl.GeoJSONSource | undefined;
      source?.setData(propertyBoundaryFeatureCollection(propertyBoundary));
    };

    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [propertyBoundary]);

  // Alert zone source data
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const source = map.getSource('alert-zones') as maplibregl.GeoJSONSource | undefined;
      source?.setData(alertZonesFeatureCollection(plots, alertPlotIds ?? []));
    };

    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [plots, alertPlotIds]);

  // Cursor style for active draw/measure modes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = mode === 'view' ? '' : 'crosshair';
  }, [mode]);

  // Token rotation: when the silent-refresh interceptor issues a new access
  // token, flush the MVT tile cache so in-flight and subsequent tile requests
  // use the updated Bearer header (transformRequest reads getAccessToken() per
  // tile, but cached responses won't be re-requested until setTiles is called).
  useEffect(() => {
    const unsubscribe = onAccessTokenChange(() => {
      const map = mapRef.current;
      if (!map || !map.isStyleLoaded()) return;
      const src = map.getSource('plots') as maplibregl.VectorTileSource | undefined;
      src?.setTiles([tileUrlRef.current]);
    });
    return unsubscribe;
  }, []);

  // Pulsing animation for alert zones + search highlight
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapInstance) return;

    let raf: number;
    const animate = () => {
      const t1 = Date.now() / 500;
      if (map.getLayer('alert-zones-circle')) {
        map.setPaintProperty('alert-zones-circle', 'circle-radius', 10 + Math.sin(t1) * 5);
        map.setPaintProperty('alert-zones-circle', 'circle-opacity', 0.25 + ((Math.sin(t1) + 1) / 2) * 0.35);
      }
      const t2 = Date.now() / 350;
      if (map.getLayer('search-highlight-circle')) {
        map.setPaintProperty('search-highlight-circle', 'circle-radius', 12 + Math.sin(t2) * 8);
        map.setPaintProperty('search-highlight-circle', 'circle-opacity', 0.3 + ((Math.sin(t2) + 1) / 2) * 0.4);
      }
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [mapInstance]);

  const handleModeChange = (newMode: MapMode) => {
    drawPointsRef.current = [];
    measureDistPointsRef.current = [];
    measureAreaPointsRef.current = [];
    setLiveLabel(null);
    const map = mapRef.current;
    if (map) {
      updateDrawSource(map, []);
      refreshMeasureSource(map);
    }
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
        try {
          await propertiesApi.updatePlotStatus(propertyId, plot.id, data.status);
        } catch {
          // Best-effort — ignore if the current role can't update plot status directly
        }
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
      />

      {layersOpen && <LayerControlsPanel layers={layers} onChange={setLayers} onClose={() => setLayersOpen(false)} />}

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
            <p className="text-sm text-slate-500 mt-1">
              Import GPS coordinates to activate the satellite map
            </p>
            <Link
              to="/survey"
              className="inline-block mt-3 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              Go to Survey →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
});
