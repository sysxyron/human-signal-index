'use client';

import { useCallback } from 'react';
import type { TunableParameter } from '@hsi/counterfactuals';
import { fmtNum } from '@/lib/worldforge/confidence';

export interface ParameterSliderProps {
  param: TunableParameter;
  value: number;
  onChange: (value: number) => void;
  className?: string;
}

/**
 * A slider for a TunableParameter. For log-scale params (e.g. cognition speed,
 * which spans 1e-10 → 1000 Hz) the slider operates in log space so the full
 * dynamic range is reachable.
 */
export function ParameterSlider({ param, value, onChange, className = '' }: ParameterSliderProps) {
  const log = !!param.logScale;
  const safeMin = log ? Math.max(param.min, 1e-300) : param.min;

  const toSlider = useCallback(
    (v: number): number => (log ? Math.log10(Math.max(v, safeMin)) : v),
    [log, safeMin],
  );
  const fromSlider = useCallback(
    (s: number): number => (log ? Math.pow(10, s) : s),
    [log],
  );

  const sliderMin = toSlider(safeMin);
  const sliderMax = toSlider(param.max);
  const sliderStep = log ? (sliderMax - sliderMin) / 200 : param.step;
  const sliderVal = toSlider(value);
  const pct = ((sliderVal - sliderMin) / Math.max(sliderMax - sliderMin, 1e-9)) * 100;

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <label className="text-body-sm font-medium text-text-primary">{param.label}</label>
        <span className="rounded bg-surface-3 px-2 py-0.5 font-mono text-caption text-electric">
          {fmtNum(value, param.unit)}
        </span>
      </div>
      <input
        type="range"
        min={sliderMin}
        max={sliderMax}
        step={sliderStep}
        value={sliderVal}
        onChange={(e) => onChange(fromSlider(Number(e.target.value)))}
        className="wf-slider w-full"
        style={{
          background: `linear-gradient(90deg, #2563EB ${pct}%, #162033 ${pct}%)`,
        }}
        aria-label={param.label}
      />
      <p className="text-caption text-text-muted">
        {param.description}
        {log ? ' (log scale)' : ''}
      </p>
    </div>
  );
}
