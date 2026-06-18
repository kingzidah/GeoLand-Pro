import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { getSimulatedTenant } from '@/utils/simulatedTenant';
import type { MapPlot } from '@/types';

interface Props {
  plots: MapPlot[];
  onSelect: (plot: MapPlot) => void;
}

export function PlotSearchBox({ plots, onSelect }: Props) {
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return plots
      .filter((p) => {
        if (p.plotNumber.toLowerCase().includes(q)) return true;
        if (p.status === 'OCCUPIED') {
          const tenant = getSimulatedTenant(p.id);
          if (tenant.fullName.toLowerCase().includes(q)) return true;
        }
        return false;
      })
      .slice(0, 8);
  }, [plots, query]);

  return (
    <div className="relative w-full sm:w-72">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search plot ID or tenant name…"
          className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
        />
      </div>
      {matches.length > 0 && (
        <div className="absolute mt-1 w-full bg-white rounded-lg shadow-lg border border-slate-200 overflow-hidden z-30">
          {matches.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                onSelect(p);
                setQuery('');
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between"
            >
              <span className="font-medium text-slate-900">{p.plotNumber}</span>
              <span className="text-xs text-slate-400">{p.status}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
