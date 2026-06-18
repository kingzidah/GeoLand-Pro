import { useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression, Layer, PathOptions } from 'leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Plot } from '@/types';

// Fix Leaflet default marker icon in bundled environments
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const STATUS_COLORS: Record<string, string> = {
  VACANT:       '#10b981',
  OCCUPIED:     '#3b82f6',
  DISPUTED:     '#ef4444',
  RESERVED:     '#f59e0b',
  UNDER_SURVEY: '#f97316',
};

interface Props {
  plots: Plot[];
  center?: [number, number];
  className?: string;
}

function FitBounds({ plots }: { plots: Plot[] }) {
  const map = useMap();

  useEffect(() => {
    if (plots.length === 0) return;
    const points: [number, number][] = [];
    for (const plot of plots) {
      if (plot.centroidLat && plot.centroidLng) {
        points.push([plot.centroidLat, plot.centroidLng]);
      }
    }
    if (points.length > 0) {
      map.fitBounds(points as LatLngBoundsExpression, { padding: [20, 20] });
    }
  }, [plots, map]);

  return null;
}

export function PlotMap({ plots, center = [5.603717, -0.186964], className }: Props) {
  return (
    <MapContainer
      center={center}
      zoom={14}
      className={className ?? 'h-96 w-full rounded-lg'}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {plots.map((plot) => (
        <GeoJSON
          key={plot.id}
          data={plot.boundaryGeoJSON as Parameters<typeof GeoJSON>[0]['data']}
          style={(): PathOptions => ({
            color: STATUS_COLORS[plot.status] ?? '#94a3b8',
            weight: 2,
            fillOpacity: 0.2,
          })}
          onEachFeature={(_: unknown, layer: Layer) => {
            (layer as L.Path).bindPopup(
              `<strong>${plot.plotNumber}</strong><br/>` +
              `Status: ${plot.status}<br/>` +
              `Area: ${plot.areaSqm.toLocaleString()} m²`
            );
          }}
        />
      ))}

      <FitBounds plots={plots} />
    </MapContainer>
  );
}
