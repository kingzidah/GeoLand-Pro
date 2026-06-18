import { cn } from '@/utils/cn';
import type { PlotStatus } from '@/types';

export type StatusFilter = PlotStatus | 'ALL';

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'OCCUPIED', label: 'Occupied' },
  { value: 'VACANT', label: 'Vacant' },
  { value: 'RESERVED', label: 'Reserved' },
  { value: 'DISPUTED', label: 'Disputed' },
];

interface Props {
  value: StatusFilter;
  onChange: (value: StatusFilter) => void;
}

export function PlotFilterChips({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {FILTERS.map((f) => (
        <button
          key={f.value}
          onClick={() => onChange(f.value)}
          className={cn(
            'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
            value === f.value
              ? 'bg-brand-600 text-white border-brand-600'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
