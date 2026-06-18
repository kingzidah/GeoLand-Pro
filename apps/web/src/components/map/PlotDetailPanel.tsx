import { Link } from 'react-router-dom';
import { X, ArrowRight } from 'lucide-react';
import { PlotStatusBadge } from '@/components/ui/Badge';
import { formatArea, formatCurrency, formatDate } from '@/utils/format';
import { getSimulatedTenant } from '@/utils/simulatedTenant';
import type { MapPlot } from '@/types';

interface Props {
  plot: MapPlot;
  onClose: () => void;
}

export function PlotDetailPanel({ plot, onClose }: Props) {
  const tenant = plot.status === 'OCCUPIED' ? getSimulatedTenant(plot.id) : null;

  let leaseEnd: Date | null = null;
  if (tenant) {
    leaseEnd = new Date(tenant.leaseStart);
    leaseEnd.setFullYear(leaseEnd.getFullYear() + 2);
  }

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

        {tenant && (
          <>
            <div className="pt-2 mt-1 border-t border-slate-100 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Tenant</span>
                <span className="font-medium text-slate-900">{tenant.fullName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Monthly Rent</span>
                <span className="font-medium text-slate-900">{formatCurrency(tenant.monthlyRentGHS)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Lease Start</span>
                <span className="font-medium text-slate-900">{formatDate(tenant.leaseStart)}</span>
              </div>
              {leaseEnd && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Lease End</span>
                  <span className="font-medium text-slate-900">{formatDate(leaseEnd.toISOString())}</span>
                </div>
              )}
            </div>
          </>
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
