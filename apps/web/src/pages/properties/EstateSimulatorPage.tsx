import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Header } from '@/components/layout/Header';
import { Card, CardHeader, CardBody, StatCard } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Plot3DMap, type Plot3DMapHandle } from '@/components/map/Plot3DMap';
import { PlotFilterChips, type StatusFilter } from '@/components/map/PlotFilterChips';
import { PlotSearchBox } from '@/components/map/PlotSearchBox';
import { propertiesApi } from '@/api/properties';
import { alertsApi } from '@/api/alerts';
import { formatArea } from '@/utils/format';

const DEMO_PROPERTY_NAME = 'Karlsruhe Simulation Estate';

export function EstateSimulatorPage() {
  const queryClient = useQueryClient();
  const mapRef = useRef<Plot3DMapHandle>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: propertiesList, isLoading: propertiesLoading } = useQuery({
    queryKey: ['simulator-properties'],
    queryFn: () => propertiesApi.list({ limit: 100 }),
  });

  const properties = propertiesList?.data ?? [];
  const selectedPropertyId = searchParams.get('property');
  const activePropertyId = selectedPropertyId ?? properties[0]?.id ?? null;

  const { data: property, isLoading: propertyLoading } = useQuery({
    queryKey: ['simulation-property', activePropertyId],
    queryFn: () => propertiesApi.getById(activePropertyId!),
    enabled: !!activePropertyId,
  });

  const { data: plots, isLoading: plotsLoading } = useQuery({
    queryKey: ['simulation-plots', property?.id],
    queryFn: () => propertiesApi.listPlotsForMap(property!.id),
    enabled: !!property?.id,
  });

  const { data: alerts } = useQuery({
    queryKey: ['simulation-alerts', property?.id],
    queryFn: () => alertsApi.list({ propertyId: property!.id }),
    enabled: !!property?.id,
  });

  const isLoading = propertiesLoading || (!!activePropertyId && propertyLoading) || (!!property && plotsLoading);

  const counts = (plots ?? []).reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {});

  const alertPlotIds = (alerts?.data ?? []).filter((a) => a.isActive).map((a) => a.plotId);

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
        title="3D Estate Simulator"
        subtitle={property ? `${property.name} — ${property.address}` : 'Select a property to view its 3D map'}
      />

      <div className="p-6 space-y-6">
        {properties.length > 1 && (
          <div className="flex items-center gap-2">
            <label htmlFor="simulator-property" className="text-sm font-medium text-slate-700">
              Viewing:
            </label>
            <select
              id="simulator-property"
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
            <CardBody>
              <p className="text-sm text-slate-500">
                No properties found. Run{' '}
                <code className="px-1.5 py-0.5 bg-slate-100 rounded text-xs">
                  npm run prisma:seed:simulation
                </code>{' '}
                in <code className="px-1.5 py-0.5 bg-slate-100 rounded text-xs">apps/api</code> to generate the demo
                estate, or create a property first.
              </p>
            </CardBody>
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
                <span>No plots yet for this property — import GPS survey data to populate the 3D map.</span>
                <Link
                  to={`/survey?property=${property.id}`}
                  className="font-medium text-brand-600 hover:text-brand-700 whitespace-nowrap"
                >
                  Go to Survey →
                </Link>
              </div>
            )}

            <Card>
              <CardHeader
                title="Tilted 3D Satellite View"
                subtitle="Drag to rotate, scroll to zoom, shift+drag to adjust pitch — colors indicate plot status"
              />
              <CardBody className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <PlotFilterChips value={statusFilter} onChange={setStatusFilter} />
                  <PlotSearchBox plots={plots ?? []} onSelect={(plot) => mapRef.current?.flyToPlot(plot.id)} />
                </div>
                <Plot3DMap
                  ref={mapRef}
                  plots={plots ?? []}
                  propertyId={property.id}
                  propertyBoundary={property.boundaryGeoJSON as GeoJSON.Geometry | null}
                  statusFilter={statusFilter}
                  alertPlotIds={alertPlotIds}
                  onPlotsChanged={() => queryClient.invalidateQueries({ queryKey: ['simulation-plots', property.id] })}
                  className="h-[36rem] w-full rounded-lg"
                />
              </CardBody>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
