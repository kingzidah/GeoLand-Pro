import { X } from 'lucide-react';

export interface LayersState {
  satellite: boolean;
  sentinel2: boolean;
  boundaries: boolean;
  labels: boolean;
  vacantHighlight: boolean;
  alertZones: boolean;
}

export const DEFAULT_LAYERS: LayersState = {
  satellite: true,
  sentinel2: false,
  boundaries: true,
  labels: false,
  vacantHighlight: false,
  alertZones: false,
};

interface Props {
  layers: LayersState;
  onChange: (layers: LayersState) => void;
  onClose: () => void;
}

const ITEMS: { key: keyof LayersState; label: string }[] = [
  { key: 'satellite', label: 'Satellite imagery (Esri)' },
  { key: 'sentinel2', label: 'Sentinel-2 (Satellite)' },
  { key: 'boundaries', label: 'Plot boundaries' },
  { key: 'labels', label: 'Plot labels (Plot ID)' },
  { key: 'vacantHighlight', label: 'Highlight vacant plots' },
  { key: 'alertZones', label: 'Alert zones' },
];

const BASE_LAYER_KEYS: (keyof LayersState)[] = ['satellite', 'sentinel2'];

export function LayerControlsPanel({ layers, onChange, onClose }: Props) {
  const toggle = (key: keyof LayersState) => {
    // Base layers act as a switch — turning one on turns the other off.
    if (BASE_LAYER_KEYS.includes(key) && !layers[key]) {
      const next = { ...layers, [key]: true };
      for (const other of BASE_LAYER_KEYS) {
        if (other !== key) next[other] = false;
      }
      onChange(next);
      return;
    }
    onChange({ ...layers, [key]: !layers[key] });
  };

  return (
    <div className="absolute top-16 right-4 z-20 w-60 bg-white rounded-xl shadow-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-slate-900">Layers</h4>
        <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100">
          <X size={14} />
        </button>
      </div>
      <div className="space-y-2.5">
        {ITEMS.map((item) => (
          <label key={item.key} className="flex items-center justify-between text-sm text-slate-700 cursor-pointer gap-3">
            <span>{item.label}</span>
            <input
              type="checkbox"
              checked={layers[item.key]}
              onChange={() => toggle(item.key)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
