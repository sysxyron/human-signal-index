'use client';

// =============================================================================
// HSI Phase 42 — Mission Control preview: an operational dashboard mock (signal
// activity, risk distribution, traceability, narrative heatmap, alerts) inside a
// terminal-style frame. Reveals on scroll; charts reuse the @hsi/ui primitives.
// =============================================================================

import { LineChart, DonutChart, HeatmapCard } from '@hsi/ui';
import { ShieldCheck, Bell } from 'lucide-react';
import { Reveal } from './motion';

export interface MissionControlData {
  series: { name: string; color: string; data: number[] }[];
  xLabels: string[];
  donut: { label: string; value: number; color: string }[];
  heat: number[][];
  heatCols: string[];
  alerts: { title: string; severity: 'low' | 'medium' | 'high' | 'critical' }[];
  traceability: number;
}

const SEV_COLOR: Record<string, string> = { low: '#3B82F6', medium: '#F59E0B', high: '#EF4444', critical: '#B91C1C' };

export function MissionControlPreview({ data }: { data: MissionControlData }) {
  return (
    <Reveal>
      <div className="glass-card overflow-hidden rounded-card border border-border bg-surface/80 shadow-glow">
        {/* terminal-style window bar */}
        <div className="flex items-center justify-between border-b border-border bg-background-deep/60 px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-risk/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-verified/70" />
            <span className="ml-3 text-caption font-medium text-text-secondary">Mission Control</span>
          </div>
          <span className="inline-flex items-center gap-1.5 text-caption text-text-muted">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-verified opacity-70" /><span className="relative inline-flex h-2 w-2 rounded-full bg-verified" /></span>
            live
          </span>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-3">
          {/* signal activity */}
          <div className="rounded-card border border-border bg-surface/50 p-3 lg:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-body-sm font-semibold text-text-primary">Signal activity</span>
              <span className="text-caption text-text-muted">last 8 weeks</span>
            </div>
            <LineChart series={data.series} xLabels={data.xLabels} height={200} />
          </div>

          {/* risk + traceability */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center rounded-card border border-border bg-surface/50 p-3">
              <span className="mb-2 self-start text-body-sm font-semibold text-text-primary">Risk distribution</span>
              <DonutChart segments={data.donut} size={130} thickness={16} centerLabel="signals" centerValue={String(data.donut.reduce((a, s) => a + s.value, 0))} />
            </div>
            <div className="rounded-card border border-border bg-surface/50 p-3">
              <span className="flex items-center gap-1.5 text-body-sm font-semibold text-text-primary"><ShieldCheck className="h-4 w-4 text-verified" /> Traceability</span>
              <div className="mt-1 text-h4 font-bold tabular-nums text-verified" style={{ textShadow: '0 0 18px #10B98140' }}>{data.traceability.toFixed(1)}%</div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-verified" style={{ width: `${data.traceability}%` }} />
              </div>
            </div>
          </div>

          {/* narrative heatmap */}
          <div className="lg:col-span-2">
            <HeatmapCard title="Narrative heatmap" subtitle="topic intensity by day" matrix={data.heat} colLabels={data.heatCols} color="#8B5CF6" />
          </div>

          {/* alerts */}
          <div className="rounded-card border border-border bg-surface/50 p-3">
            <span className="mb-2 flex items-center gap-1.5 text-body-sm font-semibold text-text-primary"><Bell className="h-4 w-4 text-warning" /> Alerts</span>
            <ul className="space-y-2">
              {data.alerts.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-caption">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: SEV_COLOR[a.severity] }} />
                  <span className="text-text-secondary">{a.title}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Reveal>
  );
}
