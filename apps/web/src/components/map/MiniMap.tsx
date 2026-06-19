import { useEffect, useRef } from 'react';
import maplibregl, { Map as MapLibreMap } from 'maplibre-gl';
import { bbox } from '@turf/turf';
import type { MapPlot } from '@/types';

interface Props {
  plots: MapPlot[];
  mainMap: MapLibreMap | null;
}

function toFeatureCollection(plots: MapPlot[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: plots
      .filter((plot) => plot.boundaryGeoJSON != null)
      .map((plot) => ({
        type: 'Feature',
        geometry: plot.boundaryGeoJSON as GeoJSON.Geometry,
        properties: { id: plot.id },
      })),
  };
}

function viewportFeature(map: MapLibreMap): GeoJSON.Feature {
  const bounds = map.getBounds();
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [bounds.getWest(), bounds.getNorth()],
          [bounds.getEast(), bounds.getNorth()],
          [bounds.getEast(), bounds.getSouth()],
          [bounds.getWest(), bounds.getSouth()],
          [bounds.getWest(), bounds.getNorth()],
        ],
      ],
    },
  };
}

export function MiniMap({ plots, mainMap }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  // Initialise the minimap once we have plots to fit bounds to
  useEffect(() => {
    if (!containerRef.current || mapRef.current || plots.length === 0) return;

    const fc = toFeatureCollection(plots);
    if (fc.features.length === 0) return;

    let bboxCoords: [number, number, number, number];
    try {
      bboxCoords = bbox(fc) as [number, number, number, number];
    } catch { return; }

    const [minX, minY, maxX, maxY] = bboxCoords;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#1e293b' } }],
      },
      center: [(minX + maxX) / 2, (minY + maxY) / 2],
      zoom: 13,
      interactive: false,
      attributionControl: false,
    });

    map.on('load', () => {
      map.addSource('plots', { type: 'geojson', data: fc });
      map.addSource('viewport', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

      map.addLayer({
        id: 'plots-fill',
        type: 'fill',
        source: 'plots',
        paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.5 },
      });
      map.addLayer({
        id: 'plots-outline',
        type: 'line',
        source: 'plots',
        paint: { 'line-color': '#1e293b', 'line-width': 1 },
      });
      map.addLayer({
        id: 'viewport',
        type: 'line',
        source: 'viewport',
        paint: { 'line-color': '#ef4444', 'line-width': 2 },
      });

      map.fitBounds(
        [
          [minX, minY],
          [maxX, maxY],
        ],
        { padding: 12, animate: false }
      );
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plots.length > 0]);

  // Sync the viewport rectangle with the main map's current view
  useEffect(() => {
    if (!mainMap) return;

    const update = () => {
      const mini = mapRef.current;
      if (!mini) return;
      const source = mini.getSource('viewport') as maplibregl.GeoJSONSource | undefined;
      if (!source) return;
      source.setData({ type: 'FeatureCollection', features: [viewportFeature(mainMap)] });
    };

    mainMap.on('move', update);
    if (mainMap.isStyleLoaded()) update();
    else mainMap.once('load', update);

    return () => {
      mainMap.off('move', update);
    };
  }, [mainMap]);

  return (
    <div className="absolute bottom-6 left-4 z-20 w-40 h-32 rounded-lg overflow-hidden border-2 border-white shadow-lg bg-slate-100">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
