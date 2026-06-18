import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatArea } from '@/utils/format';
import type { PlotStatus } from '@/types';

interface Props {
  plotNumber: string;
  areaSqm: number;
  saving: boolean;
  error?: string;
  onCancel: () => void;
  onSave: (data: { status: PlotStatus; description?: string }) => void;
}

const STATUS_OPTIONS: PlotStatus[] = ['VACANT', 'OCCUPIED', 'RESERVED', 'DISPUTED', 'UNDER_SURVEY'];

export function DrawPlotForm({ plotNumber, areaSqm, saving, error, onCancel, onSave }: Props) {
  const [status, setStatus] = useState<PlotStatus>('VACANT');
  const [notes, setNotes] = useState('');

  return (
    <div className="absolute top-4 right-4 z-30 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 p-4 space-y-3">
      <h3 className="font-semibold text-slate-900">New Plot</h3>
      {error && <p className="text-xs text-red-600">{error}</p>}

      <div>
        <label className="form-label">Plot ID</label>
        <p className="text-sm font-medium text-slate-900">{plotNumber}</p>
      </div>

      <div>
        <label className="form-label">Area</label>
        <p className="text-sm font-medium text-slate-900">{formatArea(areaSqm)}</p>
      </div>

      <div>
        <label className="form-label">Status</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as PlotStatus)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <Input label="Notes" placeholder="Optional description" value={notes} onChange={(e) => setNotes(e.target.value)} />

      <div className="flex gap-2 justify-end pt-1">
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" loading={saving} onClick={() => onSave({ status, description: notes || undefined })}>
          Save Plot
        </Button>
      </div>
    </div>
  );
}
