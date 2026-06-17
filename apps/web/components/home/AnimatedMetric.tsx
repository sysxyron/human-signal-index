'use client';

// =============================================================================
// HSI Phase 42 — animated platform metric: count-up on scroll, weekly delta,
// trend sparkline, and a subtle "live" pulse. Reduced-motion shows final values
// immediately with no animation.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import { animate, useInView, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

export interface MetricSpec {
  label: string;
  value: number;
  /** 'percent' renders value with one decimal + %; 'count' renders an integer with commas. */
  format?: 'percent' | 'count';
  accent: string;
  /** Weekly delta, e.g. +8.2 (percent points or %); sign drives the arrow + tone. */
  delta?: number;
  spark?: number[];
}

function render(value: number, format: 'percent' | 'count'): string {
  if (format === 'percent') return `${value.toFixed(1)}%`;
  return Math.round(value).toLocaleString('en-US');
}

function sparkPath(spark: number[], w: number, h: number): string {
  if (spark.length < 2) return '';
  const min = Math.min(...spark);
  const max = Math.max(...spark);
  const span = max - min || 1;
  return spark
    .map((v, i) => `${(i / (spark.length - 1)) * w},${h - ((v - min) / span) * h}`)
    .map((p, i) => (i === 0 ? `M ${p}` : `L ${p}`))
    .join(' ');
}

export function AnimatedMetric({ spec }: { spec: MetricSpec }) {
  const format = spec.format ?? 'count';
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const [display, setDisplay] = useState(() => render(reduce ? spec.value : 0, format));

  useEffect(() => {
    if (reduce) { setDisplay(render(spec.value, format)); return; }
    if (!inView) return;
    const controls = animate(0, spec.value, {
      duration: 1.4,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(render(v, format)),
    });
    return () => controls.stop();
  }, [inView, reduce, spec.value, format]);

  const deltaTone = (spec.delta ?? 0) >= 0 ? '#10B981' : '#EF4444';
  const DeltaIcon = (spec.delta ?? 0) >= 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <div ref={ref} className="relative overflow-hidden rounded-card border border-border bg-surface/60 p-4">
      <div className="flex items-center justify-between">
        <span className="text-label uppercase tracking-wide text-text-muted">{spec.label}</span>
        <span className="relative flex h-2 w-2">
          {!reduce ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ backgroundColor: spec.accent }} /> : null}
          <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: spec.accent }} />
        </span>
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <span className="text-h4 font-bold tabular-nums text-text-primary" style={{ textShadow: `0 0 18px ${spec.accent}40` }}>{display}</span>
        {spec.spark && spec.spark.length > 1 ? (
          <svg width="56" height="20" viewBox="0 0 56 20" className="shrink-0" aria-hidden>
            <path d={sparkPath(spec.spark, 56, 20)} fill="none" stroke={spec.accent} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
          </svg>
        ) : null}
      </div>
      {spec.delta !== undefined ? (
        <div className="mt-1 inline-flex items-center gap-1 text-caption font-semibold" style={{ color: deltaTone }}>
          <DeltaIcon className="h-3.5 w-3.5" />
          {Math.abs(spec.delta).toFixed(1)}{format === 'percent' ? ' pts' : '%'} <span className="font-normal text-text-muted">this week</span>
        </div>
      ) : null}
    </div>
  );
}
