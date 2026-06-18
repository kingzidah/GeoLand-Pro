import { Pencil, Ruler, Square, Eraser, Layers as LayersIcon } from 'lucide-react';
import { cn } from '@/utils/cn';

export type MapMode = 'view' | 'draw-plot' | 'measure-distance' | 'measure-area';

interface Props {
  mode: MapMode;
  onModeChange: (mode: MapMode) => void;
  onClearMeasurements: () => void;
  onToggleLayers: () => void;
  layersOpen: boolean;
  liveLabel?: string | null;
}

export function MapToolbar({ mode, onModeChange, onClearMeasurements, onToggleLayers, layersOpen, liveLabel }: Props) {
  const toggle = (m: MapMode) => onModeChange(mode === m ? 'view' : m);

  const buttonClass = (active: boolean) =>
    cn(
      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium shadow-sm border transition-colors',
      active
        ? 'bg-brand-600 text-white border-brand-600'
        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
    );

  return (
    <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 max-w-[calc(100%-2rem)]">
      <div className="flex flex-wrap gap-2">
        <button className={buttonClass(mode === 'draw-plot')} onClick={() => toggle('draw-plot')}>
          <Pencil size={14} /> Draw Plot
        </button>
        <button className={buttonClass(mode === 'measure-distance')} onClick={() => toggle('measure-distance')}>
          <Ruler size={14} /> Measure Distance
        </button>
        <button className={buttonClass(mode === 'measure-area')} onClick={() => toggle('measure-area')}>
          <Square size={14} /> Measure Area
        </button>
        <button className={buttonClass(false)} onClick={onClearMeasurements}>
          <Eraser size={14} /> Clear Measurements
        </button>
        <button className={buttonClass(layersOpen)} onClick={onToggleLayers}>
          <LayersIcon size={14} /> Layers
        </button>
      </div>
      {mode !== 'view' && (
        <div className="self-start px-3 py-1.5 rounded-lg bg-slate-900/80 text-white text-xs font-medium shadow-sm">
          {mode === 'draw-plot' && 'Click to add points · double-click to close polygon'}
          {mode === 'measure-distance' && 'Click two points to measure distance'}
          {mode === 'measure-area' && 'Click points · double-click to close shape'}
          {liveLabel && <span className="ml-2 font-semibold">{liveLabel}</span>}
        </div>
      )}
    </div>
  );
}
