import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Satellite, Building2 } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardHeader, CardBody, StatCard } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Plot3DMap, type Plot3DMapHandle } from '@/components/map/Plot3DMap';
import { PlotFilterChips, type StatusFilter } from '@/components/map/PlotFilterChips';
import { PlotSearchBox } from '@/components/map/PlotSearchBox';
import { SatellitePanel } from '@/components/map/SatellitePanel';
import { CapabilityGate } from '@/auth/CapabilityGate';
import { propertiesApi } from '@/api/properties';
import { alertsApi } from '@/api/alerts';
import { formatArea } from '@/utils/format';
import { Capability } from '@geolandpro/rbac';

const SATELLITE_CAPABILITIES = [Capability.SATELLITE_MANAGE, Capability.SATELLITE_VIEW];

const DEMO_PROPERTY_NAME = 'Karlsruhe Simulation Estate';

export function PropertyMapPage() {
  const queryClient = useQueryClient();
  const mapRef = useRef<Plot3DMapHandle>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [searchParams, setSearchParams] = useSearchParams();
  const [satelliteOpen, setSatelliteOpen] = useState(false);

  const { data: propertiesList, isLoading: propertiesLoading } = useQuery({
    queryKey: ['map-properties'],
    queryFn: () => propertiesApi.list({ limit: 100 }),
  });

  const properties = propertiesList?.data ?? [];
  const selectedPropertyId = searchParams.get('property');
  const activePropertyId = selectedPropertyId ?? properties[0]?.id ?? null;

  const { data: property, isLoading: propertyLoading } = useQuery({
    queryKey: ['map-property', activePropertyId],
    queryFn: () => propertiesApi.getById(activePropertyId!),
    enabled: !!activePropertyId,
  });

  const { data: plots, isLoading: plotsLoading } = useQuery({
    queryKey: ['map-plots', property?.id],
    queryFn: () => propertiesApi.listPlotsForMap(property!.id),
    enabled: !!property?.id,
  });

  const { data: alerts } = useQuery({
    queryKey: ['map-alerts', property?.id],
    queryFn: () => alertsApi.list({ propertyId: property!.id }),
    enabled: !!property?.id,
  });

  const isLoading = propertiesLoading || (!!activePropertyId && propertyLoading) || (!!property && plotsLoading);

  const counts = (plots ?? []).reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {});

  const alertPlotIds = (alerts?.data ?? []).filter((a) => a.isActive).map((a) => a.plotId);

  // When no ?property= URL param is present, activePropertyId silently
  // defaults to properties[0]?.id. Write it into the URL immediately so the
  // URL is always the single source of truth — every property switch (including
  // the implicit first-load default) goes through ?property=<id>, preventing
  // desync between the header, tile URL, and plots array.
  useEffect(() => {
    if (selectedPropertyId !== null || !activePropertyId) return;
    const next = new URLSearchParams(searchParams);
    next.set('property', activePropertyId);
    setSearchParams(next, { replace: true });
    // searchParams / setSearchParams are stable refs from react-router
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePropertyId, selectedPropertyId]);

  const focusPlotId = searchParams.get('plot');
  useEffect(() => {
    if (!focusPlotId || !plots?.length) return;
    if (!plots.some((p) => p.id === focusPlotId)) return;
    mapRef.current?.flyToPlot(focusPlotId);
    const next = new URLSearchParams(searchParams);
    next.delete('plot');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPlotId, plots]);

  const handlePropertyChange = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('property', id);
    next.delete('plot');
    setSearchParams(next, { replace: true });
  };

  const isDemoProperty = property?.name === DEMO_PROPERTY_NAME;

  return (
    <div>
      <Header
        title="Property Map"
        subtitle={property ? `${property.name} — ${property.address}` : 'Select a property to view its map'}
        actions={
          property && (
            <CapabilityGate capabilities={SATELLITE_CAPABILITIES}>
              <Button
                variant={satelliteOpen ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setSatelliteOpen((o) => !o)}
              >
                <Satellite size={15} />
                Satellite Monitoring
              </Button>
            </CapabilityGate>
          )
        }
      />

      <div className="p-6 space-y-6">
        {properties.length > 1 && (
          <div className="flex items-center gap-2">
            <label htmlFor="map-property" className="text-sm font-medium text-slate-700">
              Viewing:
            </label>
            <select
              id="map-property"
              value={activePropertyId ?? ''}
              onChange={(e) => handlePropertyChange(e.target.value)}
              className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {isDemoProperty && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <strong>DEMO DATA</strong> — Karlsruhe simulation (placeholder until Ghana survey data is imported)
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner size="lg" /></div>
        ) : !property ? (
          <Card>
            <EmptyState
              icon={<Building2 size={22} />}
              title="No properties yet"
              description="Add your first property to start managing your land portfolio"
            />
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <StatCard label="Total Plots" value={(plots?.length ?? 0).toLocaleString()} />
              <StatCard label="Total Area" value={formatArea(property.totalAreaSqm)} />
              <StatCard label="Occupied" value={(counts.OCCUPIED ?? 0).toLocaleString()} />
              <StatCard label="Vacant" value={(counts.VACANT ?? 0).toLocaleString()} />
              <StatCard label="Reserved / Disputed" value={`${counts.RESERVED ?? 0} / ${counts.DISPUTED ?? 0}`} />
            </div>

            {(plots?.length ?? 0) === 0 && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 flex items-center justify-between gap-3">
                <span>No plots yet for this property — import GPS survey data to populate the map.</span>
                <Link
                  to={`/survey?property=${property.id}`}
                  className="font-medium text-brand-600 hover:text-brand-700 whitespace-nowrap"
                >
                  Go to Survey →
                </Link>
              </div>
            )}

            <div className="flex flex-col xl:flex-row gap-4 items-start">
              <Card className="flex-1 min-w-0 w-full">
                <CardHeader
                  title="Property Map"
                  subtitle="Drag to rotate, scroll to zoom, shift+drag to adjust pitch — colors indicate plot status"
                />
                <CardBody className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <PlotFilterChips value={statusFilter} onChange={setStatusFilter} />
                    <PlotSearchBox plots={plots ?? []} onSelect={(plot) => mapRef.current?.flyToPlot(plot.id)} />
                  </div>
                  <Plot3DMap
                    key={property.id}
                    ref={mapRef}
                    plots={plots ?? []}
                    propertyId={property.id}
                    propertyBoundary={property.boundaryGeoJSON as GeoJSON.Geometry | null}
                    statusFilter={statusFilter}
                    alertPlotIds={alertPlotIds}
                    onPlotsChanged={() => queryClient.invalidateQueries({ queryKey: ['map-plots', property.id] })}
                    className="h-[36rem] w-full rounded-lg"
                  />
                </CardBody>
              </Card>

              {satelliteOpen && (
                <CapabilityGate capabilities={SATELLITE_CAPABILITIES}>
                  <div className="w-full xl:w-[26rem] flex-shrink-0">
                    <SatellitePanel propertyId={property.id} onClose={() => setSatelliteOpen(false)} />
                  </div>
                </CapabilityGate>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
