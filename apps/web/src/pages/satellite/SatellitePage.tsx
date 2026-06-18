import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Satellite, Clock, AlertTriangle, Image as ImageIcon, MapPin } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Plot3DMap } from '@/components/map/Plot3DMap';
import { satelliteApi } from '@/api/satellite';
import { alertsApi } from '@/api/alerts';
import { propertiesApi } from '@/api/properties';
import { getApiError } from '@/api/client';
import { formatDate, formatDateTime } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { SatelliteImage, AlertEvent, GeofenceAlert } from '@/types';

const TIER1_CADENCE_DAYS = 5;
const SELECT_CLASS =
  'text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500';

interface TierInfo {
  tier: number;
  name: string;
  status: 'ACTIVE' | 'AVAILABLE ON REQUEST' | 'INSTITUTIONAL';
  provider: string;
  resolution: string;
  cadence: string;
}

const TIERS: TierInfo[] = [
  {
    tier: 1,
    name: 'Foundation',
    status: 'ACTIVE',
    provider: 'Sentinel-2 (ESA Copernicus)',
    resolution: '10m / pixel',
    cadence: 'Refreshed every 5 days',
  },
  {
    tier: 2,
    name: 'Standard',
    status: 'AVAILABLE ON REQUEST',
    provider: 'Planet SkySat',
    resolution: '0.5m / pixel',
    cadence: 'On-demand tasking, ~1-3 days',
  },
  {
    tier: 3,
    name: 'Professional',
    status: 'AVAILABLE ON REQUEST',
    provider: 'Maxar WorldView',
    resolution: '0.3m / pixel',
    cadence: 'On-demand priority tasking',
  },
  {
    tier: 4,
    name: 'Enterprise',
    status: 'INSTITUTIONAL',
    provider: 'Custom aerial / drone survey',
    resolution: '<0.1m / pixel',
    cadence: 'Scheduled institutional survey',
  },
];

function TierStatusCard({ tier }: { tier: TierInfo }) {
  const isActive = tier.status === 'ACTIVE';
  return (
    <Card className={cn('p-5', isActive ? 'border-emerald-200' : 'border-slate-200')}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Tier {tier.tier}</p>
          <p className="text-base font-bold text-slate-900 mt-0.5">{tier.name}</p>
        </div>
        <Badge variant={isActive ? 'green' : 'slate'}>{tier.status}</Badge>
      </div>
      <div className="mt-4 space-y-1.5 text-xs text-slate-500">
        <p><span className="text-slate-400">Provider:</span> {tier.provider}</p>
        <p><span className="text-slate-400">Resolution:</span> {tier.resolution}</p>
        <p><span className="text-slate-400">Cadence:</span> {tier.cadence}</p>
      </div>
    </Card>
  );
}

function statusBadgeVariant(status: string): 'green' | 'yellow' | 'red' | 'slate' {
  const s = status.toLowerCase();
  if (s === 'completed' || s === 'available' || s === 'success') return 'green';
  if (s === 'pending' || s === 'processing') return 'yellow';
  if (s === 'failed' || s === 'error') return 'red';
  return 'slate';
}

function formatCloudCover(value: number | null): string {
  return value == null ? '—' : `${value.toFixed(0)}%`;
}

function formatChangeScore(value: number | null): string {
  return value == null ? '—' : value.toFixed(2);
}

interface ChangeAlertEntry {
  alert: GeofenceAlert;
  event: AlertEvent;
}

function OrderModal({ open, onClose, propertyId }: { open: boolean; onClose: () => void; propertyId: string }) {
  const [tier, setTier] = useState<2 | 3 | 4>(2);
  const [notes, setNotes] = useState('');
  const queryClient = useQueryClient();

  const orderMutation = useMutation({
    mutationFn: () => satelliteApi.createOrder(propertyId, { tier, notes: notes || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['satellite-latest', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['satellite-history', propertyId] });
      setNotes('');
      onClose();
    },
  });

  const orderTiers = TIERS.filter((t) => t.tier > 1);

  return (
    <Modal open={open} onClose={onClose} title="Order High-Resolution Capture" size="md">
      <div className="space-y-4">
        {orderMutation.error && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {getApiError(orderMutation.error)}
          </div>
        )}

        <div>
          <label className="form-label">Select tier</label>
          <div className="space-y-2">
            {orderTiers.map((t) => (
              <label
                key={t.tier}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                  tier === t.tier ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'
                )}
              >
                <input
                  type="radio"
                  name="tier"
                  className="mt-1"
                  checked={tier === t.tier}
                  onChange={() => setTier(t.tier as 2 | 3 | 4)}
                />
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Tier {t.tier} — {t.name}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t.provider} · {t.resolution} · {t.cadence}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="form-label">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Anything specific you'd like the imagery provider to know…"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={orderMutation.isPending}>
            Cancel
          </Button>
          <Button loading={orderMutation.isPending} onClick={() => orderMutation.mutate()}>
            Place Order
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function BeforeAfterSlider({ history }: { history: SatelliteImage[] }) {
  const withImages = history.filter((h): h is SatelliteImage & { imageUrl: string } => !!h.imageUrl);
  const [beforeId, setBeforeId] = useState('');
  const [afterId, setAfterId] = useState('');
  const [sliderPos, setSliderPos] = useState(50);

  useEffect(() => {
    if (withImages.length >= 2 && (!beforeId || !afterId)) {
      setBeforeId(withImages[withImages.length - 1].id);
      setAfterId(withImages[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withImages.length]);

  if (withImages.length < 2) {
    return (
      <div className="text-center py-10">
        <ImageIcon size={32} className="mx-auto text-slate-300 mb-2" />
        <p className="text-sm text-slate-500">
          Need at least two captures with stored imagery to compare before/after.
        </p>
      </div>
    );
  }

  const before = withImages.find((h) => h.id === beforeId) ?? withImages[withImages.length - 1];
  const after = withImages.find((h) => h.id === afterId) ?? withImages[0];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <div>
          <label className="form-label">Before</label>
          <select aria-label="Before capture" value={before.id} onChange={(e) => setBeforeId(e.target.value)} className={cn(SELECT_CLASS, 'w-full')}>
            {withImages.map((h) => (
              <option key={h.id} value={h.id}>{formatDate(h.capturedAt)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">After</label>
          <select aria-label="After capture" value={after.id} onChange={(e) => setAfterId(e.target.value)} className={cn(SELECT_CLASS, 'w-full')}>
            {withImages.map((h) => (
              <option key={h.id} value={h.id}>{formatDate(h.capturedAt)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-slate-200 bg-slate-100 select-none">
        <img src={after.imageUrl} alt={`After — ${formatDate(after.capturedAt)}`} className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}>
          <img src={before.imageUrl} alt={`Before — ${formatDate(before.capturedAt)}`} className="absolute inset-0 w-full h-full object-cover" />
        </div>
        <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg pointer-events-none" style={{ left: `${sliderPos}%` }} />
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/50 text-white text-xs font-medium">
          {formatDate(before.capturedAt)}
        </div>
        <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/50 text-white text-xs font-medium">
          {formatDate(after.capturedAt)}
        </div>
        <input
          type="range"
          aria-label="Before/after comparison slider"
          min={0}
          max={100}
          value={sliderPos}
          onChange={(e) => setSliderPos(Number(e.target.value))}
          className="absolute inset-x-0 bottom-3 w-[90%] left-[5%]"
        />
      </div>
    </div>
  );
}

export function SatellitePage() {
  const [orderOpen, setOrderOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: propertiesList, isLoading: propertiesLoading } = useQuery({
    queryKey: ['satellite-properties'],
    queryFn: () => propertiesApi.list({ limit: 100 }),
  });

  const properties = propertiesList?.data ?? [];
  const selectedPropertyId = searchParams.get('property');
  const propertyId = selectedPropertyId ?? properties[0]?.id ?? null;

  const handlePropertyChange = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('property', id);
    setSearchParams(next, { replace: true });
  };

  const { data: property, isLoading: propertyLoading } = useQuery({
    queryKey: ['satellite-property', propertyId],
    queryFn: () => propertiesApi.getById(propertyId!),
    enabled: !!propertyId,
  });

  const { data: plots } = useQuery({
    queryKey: ['satellite-plots', property?.id],
    queryFn: () => propertiesApi.listPlotsForMap(property!.id),
    enabled: !!property?.id,
  });

  const { data: latest, isLoading: latestLoading } = useQuery({
    queryKey: ['satellite-latest', property?.id],
    queryFn: () => satelliteApi.getLatest(property!.id),
    enabled: !!property?.id,
  });

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ['satellite-history', property?.id],
    queryFn: () => satelliteApi.getHistory(property!.id),
    enabled: !!property?.id,
  });

  const { data: alertsList } = useQuery({
    queryKey: ['satellite-alerts', property?.id],
    queryFn: () => alertsApi.list({ propertyId: property!.id }),
    enabled: !!property?.id,
  });

  const { data: changeAlerts, isLoading: changeAlertsLoading } = useQuery({
    queryKey: ['satellite-change-events', property?.id, alertsList?.data.map((a) => a.id).join(',')],
    queryFn: async () => {
      const alerts = alertsList?.data ?? [];
      const results = await Promise.all(
        alerts.map(async (alert) => {
          const res = await alertsApi.listEvents(alert.id, { eventType: 'SATELLITE_CHANGE', limit: 5 });
          return res.data.map((event): ChangeAlertEntry => ({ alert, event }));
        })
      );
      return results
        .flat()
        .sort((a, b) => new Date(b.event.triggeredAt).getTime() - new Date(a.event.triggeredAt).getTime());
    },
    enabled: !!alertsList,
  });

  const alertPlotIds = (alertsList?.data ?? []).filter((a) => a.isActive).map((a) => a.plotId);

  const isLoading = propertiesLoading || (!!propertyId && propertyLoading);

  return (
    <div>
      <Header
        title="Satellite Monitoring"
        subtitle="Imagery tiers, capture history, and automated change-detection alerts"
      />

      <div className="p-6 space-y-6">
        {properties.length > 1 && (
          <div className="flex items-center gap-2">
            <label htmlFor="satellite-property" className="text-sm font-medium text-slate-700">
              Property:
            </label>
            <select
              id="satellite-property"
              value={propertyId ?? ''}
              onChange={(e) => handlePropertyChange(e.target.value)}
              className={SELECT_CLASS}
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-20"><Spinner size="lg" /></div>
        ) : !property ? (
          <Card>
            <CardBody>
              <p className="text-sm text-slate-500">No properties found. Create a property first.</p>
            </CardBody>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {TIERS.map((tier) => (
                <TierStatusCard key={tier.tier} tier={tier} />
              ))}
            </div>

            <Card>
              <CardHeader
                title="Live Map"
                subtitle={
                  latest
                    ? `Sentinel-2 base layer — captured ${formatDate(latest.capturedAt)}`
                    : 'Sentinel-2 base layer with plot boundaries and alert zones'
                }
              />
              <CardBody>
                <Plot3DMap
                  plots={plots ?? []}
                  propertyId={property.id}
                  propertyBoundary={property.boundaryGeoJSON as GeoJSON.Geometry | null}
                  alertPlotIds={alertPlotIds}
                  initialLayers={{ satellite: false, sentinel2: true, boundaries: true, alertZones: true }}
                  className="h-[28rem] w-full rounded-lg"
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Latest Image"
                subtitle="Most recent capture for this property"
                action={
                  <Button size="sm" onClick={() => setOrderOpen(true)}>
                    <Satellite size={15} />
                    Order High-Resolution Capture
                  </Button>
                }
              />
              <CardBody>
                {latestLoading ? (
                  <div className="flex justify-center py-10"><Spinner /></div>
                ) : !latest ? (
                  <div className="text-center py-10">
                    <ImageIcon size={36} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-slate-500 text-sm">No imagery captured yet</p>
                    <p className="text-slate-400 text-xs mt-1 flex items-center justify-center gap-1.5">
                      <Clock size={13} />
                      Monitoring active — next image scheduled in {TIER1_CADENCE_DAYS} days
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <Stat label="Capture Date" value={formatDate(latest.capturedAt)} />
                    <Stat label="Provider" value={latest.provider} />
                    <Stat label="Resolution" value={latest.resolution > 0 ? `${latest.resolution}m` : '—'} />
                    <Stat label="Cloud Cover" value={formatCloudCover(latest.cloudCover)} />
                    <div>
                      <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Status</p>
                      <div className="mt-1">
                        <Badge variant={statusBadgeVariant(latest.status)}>{latest.status}</Badge>
                      </div>
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Image History" subtitle="Most recent captures, newest first" />
              <CardBody className="p-0">
                {historyLoading ? (
                  <div className="flex justify-center py-10"><Spinner /></div>
                ) : !history?.length ? (
                  <div className="text-center py-10 text-sm text-slate-500">No capture history yet</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50">
                          <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Date</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Provider</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Resolution</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Cloud Cover</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Change Score</th>
                          <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {history.map((image: SatelliteImage) => (
                          <tr key={image.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-3 text-slate-700">{formatDate(image.capturedAt)}</td>
                            <td className="px-6 py-3 text-slate-600">{image.provider}</td>
                            <td className="px-6 py-3 text-slate-500">{image.resolution > 0 ? `${image.resolution}m` : '—'}</td>
                            <td className="px-6 py-3 text-slate-500">{formatCloudCover(image.cloudCover)}</td>
                            <td className="px-6 py-3 text-slate-500">{formatChangeScore(image.changeScore)}</td>
                            <td className="px-6 py-3">
                              <Badge variant={statusBadgeVariant(image.status)}>{image.status}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Before / After Comparison" subtitle="Drag the slider to compare two captures" />
              <CardBody>
                <BeforeAfterSlider history={history ?? []} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Change Detection Alerts"
                subtitle="Automated alerts triggered by satellite change-detection analysis"
              />
              <CardBody className="p-0">
                {changeAlertsLoading ? (
                  <div className="flex justify-center py-10"><Spinner /></div>
                ) : !changeAlerts?.length ? (
                  <div className="text-center py-10">
                    <AlertTriangle size={32} className="mx-auto text-slate-300 mb-2" />
                    <p className="text-sm text-slate-500">No change-detection alerts</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {changeAlerts.map(({ alert, event }) => (
                      <div key={event.id} className="flex items-center justify-between px-6 py-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-orange-50 rounded-lg text-orange-600">
                            <AlertTriangle size={16} />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-900">
                              Plot {alert.plot.plotNumber} — satellite change detected
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">{formatDateTime(event.triggeredAt)}</p>
                          </div>
                        </div>
                        <Link
                          to={`/estate-simulator?plot=${alert.plotId}`}
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
                        >
                          <MapPin size={14} />
                          View on Map
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          </>
        )}
      </div>

      {property && <OrderModal open={orderOpen} onClose={() => setOrderOpen(false)} propertyId={property.id} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
