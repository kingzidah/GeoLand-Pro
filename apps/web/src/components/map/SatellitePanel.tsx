import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Satellite, Clock, AlertTriangle, Image as ImageIcon, MapPin, X, ShieldCheck } from 'lucide-react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { satelliteApi } from '@/api/satellite';
import { alertsApi } from '@/api/alerts';
import { getApiError } from '@/api/client';
import { formatDate, formatDateTime } from '@/utils/format';
import { cn } from '@/utils/cn';
import { CapabilityGate } from '@/auth/CapabilityGate';
import { Capability } from '@geolandpro/rbac';
import type { SatelliteImage, AlertEvent, GeofenceAlert } from '@/types';

const TIER1_CADENCE_DAYS = 5;
const SELECT_CLASS =
  'text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500';
const HISTORY_LIMIT = 5;

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
    <div className={cn('p-4 rounded-lg border', isActive ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200')}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Tier {tier.tier}</p>
          <p className="text-sm font-bold text-slate-900 mt-0.5">{tier.name}</p>
        </div>
        <Badge variant={isActive ? 'green' : 'slate'}>{tier.status}</Badge>
      </div>
      <div className="mt-3 space-y-1 text-xs text-slate-500">
        <p><span className="text-slate-400">Provider:</span> {tier.provider}</p>
        <p><span className="text-slate-400">Resolution:</span> {tier.resolution}</p>
        <p><span className="text-slate-400">Cadence:</span> {tier.cadence}</p>
      </div>
    </div>
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
      <div className="text-center py-8">
        <ImageIcon size={28} className="mx-auto text-slate-300 mb-2" />
        <p className="text-xs text-slate-500">
          Need at least two captures with stored imagery to compare before/after.
        </p>
      </div>
    );
  }

  const before = withImages.find((h) => h.id === beforeId) ?? withImages[withImages.length - 1];
  const after = withImages.find((h) => h.id === afterId) ?? withImages[0];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

interface SatellitePanelProps {
  propertyId: string;
  onClose: () => void;
}

export function SatellitePanel({ propertyId, onClose }: SatellitePanelProps) {
  const [orderOpen, setOrderOpen] = useState(false);

  const { data: latest, isLoading: latestLoading } = useQuery({
    queryKey: ['satellite-latest', propertyId],
    queryFn: () => satelliteApi.getLatest(propertyId),
    enabled: !!propertyId,
  });

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ['satellite-history', propertyId],
    queryFn: () => satelliteApi.getHistory(propertyId),
    enabled: !!propertyId,
  });

  const { data: alertsList } = useQuery({
    queryKey: ['satellite-alerts', propertyId],
    queryFn: () => alertsApi.list({ propertyId }),
    enabled: !!propertyId,
  });

  const { data: changeAlerts, isLoading: changeAlertsLoading } = useQuery({
    queryKey: ['satellite-change-events', propertyId, alertsList?.data.map((a) => a.id).join(',')],
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

  const recentHistory = (history ?? []).slice(0, HISTORY_LIMIT);

  return (
    <Card className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto">
      <CardHeader
        title="Satellite Monitoring"
        subtitle="Imagery tiers, capture history & change alerts"
        action={
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Close satellite panel"
          >
            <X size={16} />
          </button>
        }
      />

      <CardBody className="space-y-6">
        {/* Tier cards — vertical */}
        <div className="space-y-3">
          {TIERS.map((tier) => (
            <TierStatusCard key={tier.tier} tier={tier} />
          ))}
        </div>

        {/* Order capture button — Super Admin / Admin only (Manager is view-only) */}
        <CapabilityGate capabilities={[Capability.SATELLITE_MANAGE]}>
          <Button size="sm" className="w-full" onClick={() => setOrderOpen(true)}>
            <Satellite size={15} />
            Order High-Resolution Capture
          </Button>
        </CapabilityGate>

        {/* Latest image */}
        <div>
          <h4 className="text-sm font-semibold text-slate-900 mb-3">Latest Image</h4>
          {latestLoading ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : !latest ? (
            <div className="text-center py-6">
              <ImageIcon size={28} className="mx-auto text-slate-300 mb-2" />
              <p className="text-slate-500 text-xs">No imagery captured yet</p>
              <p className="text-slate-400 text-xs mt-1 flex items-center justify-center gap-1.5">
                <Clock size={12} />
                Next image in {TIER1_CADENCE_DAYS} days
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Capture Date" value={formatDate(latest.capturedAt)} />
              <Stat label="Provider" value={latest.provider} />
              <Stat label="Resolution" value={latest.resolution > 0 ? `${latest.resolution}m` : '—'} />
              <Stat label="Cloud Cover" value={formatCloudCover(latest.cloudCover)} />
              <div className="col-span-2">
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Status</p>
                <div className="mt-1">
                  <Badge variant={statusBadgeVariant(latest.status)}>{latest.status}</Badge>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Before / after */}
        <div>
          <h4 className="text-sm font-semibold text-slate-900 mb-3">Before / After Comparison</h4>
          <BeforeAfterSlider history={history ?? []} />
        </div>

        {/* Image history */}
        <div>
          <h4 className="text-sm font-semibold text-slate-900 mb-3">Image History</h4>
          {historyLoading ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : !recentHistory.length ? (
            <p className="text-center text-xs text-slate-500 py-6">No capture history yet</p>
          ) : (
            <div className="space-y-2">
              {recentHistory.map((image: SatelliteImage) => (
                <div key={image.id} className="flex items-center justify-between text-xs px-3 py-2 rounded-lg border border-slate-100">
                  <div>
                    <p className="font-medium text-slate-700">{formatDate(image.capturedAt)}</p>
                    <p className="text-slate-400">{image.provider} · {image.resolution > 0 ? `${image.resolution}m` : '—'} · cloud {formatCloudCover(image.cloudCover)} · Δ {formatChangeScore(image.changeScore)}</p>
                  </div>
                  <Badge variant={statusBadgeVariant(image.status)}>{image.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Change detection alerts */}
        <div>
          <h4 className="text-sm font-semibold text-slate-900 mb-3">Change Detection Alerts</h4>
          {changeAlertsLoading ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : !changeAlerts?.length ? (
            <EmptyState
              icon={<ShieldCheck size={22} />}
              title="All clear — no active alerts"
              description="Boundary alerts appear here when the geofencing system detects changes to your plot boundaries"
            />
          ) : (
            <div className="space-y-2">
              {changeAlerts.map(({ alert, event }) => (
                <div key={event.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-100">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="p-1.5 bg-orange-50 rounded-lg text-orange-600 flex-shrink-0">
                      <AlertTriangle size={14} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-900 truncate">
                        Plot {alert.plot.plotNumber} — change detected
                      </p>
                      <p className="text-xs text-slate-500">{formatDateTime(event.triggeredAt)}</p>
                    </div>
                  </div>
                  <Link
                    to={`/map?plot=${alert.plotId}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 flex-shrink-0"
                  >
                    <MapPin size={12} />
                    View
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardBody>

      {<OrderModal open={orderOpen} onClose={() => setOrderOpen(false)} propertyId={propertyId} />}
    </Card>
  );
}
