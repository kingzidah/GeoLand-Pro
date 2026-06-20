import { Link } from 'react-router-dom';
import { X, ArrowRight, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { PlotStatusBadge } from '@/components/ui/Badge';
import { formatArea, formatCurrency, formatDate } from '@/utils/format';
import { plotsApi } from '@/api/plots';
import type { MapPlot } from '@/types';

interface Props {
  plot: MapPlot;
  onClose: () => void;
}

export function PlotDetailPanel({ plot, onClose }: Props) {
  const { data: detail, isLoading } = useQuery({
    queryKey: ['plot-detail', plot.id],
    queryFn: () => plotsApi.getById(plot.id),
    staleTime: 30_000,
  });

  const activeLease = detail?.leaseAgreements.find((l) => l.status === 'ACTIVE') ?? null;

  return (
    <div className="absolute top-4 right-4 z-30 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h3 className="font-semibold text-slate-900">{plot.plotNumber}</h3>
        <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100">
          <X size={16} />
        </button>
      </div>
      <div className="p-4 space-y-2.5 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Status</span>
          <PlotStatusBadge status={plot.status} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Area</span>
          <span className="font-medium text-slate-900">{formatArea(plot.areaSqm)}</span>
        </div>

        {isLoading && (
          <div className="pt-2 mt-1 border-t border-slate-100 flex items-center gap-2 text-slate-400 text-xs">
            <Loader2 size={12} className="animate-spin" />
            Loading lease data…
          </div>
        )}

        {!isLoading && activeLease && (
          <div className="pt-2 mt-1 border-t border-slate-100 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Tenant</span>
              <span className="font-medium text-slate-900">
                {activeLease.tenant.user.firstName} {activeLease.tenant.user.lastName}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Monthly Rent</span>
              <span className="font-medium text-slate-900">{formatCurrency(activeLease.monthlyRentGHS)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Lease Start</span>
              <span className="font-medium text-slate-900">{formatDate(activeLease.startDate)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Lease End</span>
              <span className="font-medium text-slate-900">{formatDate(activeLease.endDate)}</span>
            </div>
            {activeLease.arrearsGHS > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Arrears</span>
                <span className="font-medium text-red-600">{formatCurrency(activeLease.arrearsGHS)}</span>
              </div>
            )}
          </div>
        )}

        {!isLoading && !activeLease && detail && (
          <div className="pt-2 mt-1 border-t border-slate-100 text-xs text-slate-400 italic">
            No active tenant
          </div>
        )}

        <Link
          to={`/plots/${plot.id}`}
          className="mt-3 flex items-center justify-center gap-1.5 w-full rounded-lg bg-brand-600 text-white py-2 text-sm font-medium hover:bg-brand-700 transition-colors"
        >
          View Full Details <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
