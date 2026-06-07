'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ScoredMetric } from '@hsi/simulation-engine';
import { Card } from '@hsi/ui';
import { ProvenancePanel } from './ProvenancePanel';
import { ScientificConfidenceChip } from './ScientificConfidenceChip';
import { fmtPct } from '@/lib/worldforge/confidence';

export interface MetricWithProvenanceProps {
  label: string;
  metric: ScoredMetric;
  /** If true, render value as a percentage (0..1 → %). Default true. */
  asPercent?: boolean;
  className?: string;
}

/** A scored metric card with an expandable provenance drawer. */
export function MetricWithProvenance({
  label,
  metric,
  asPercent = true,
  className = '',
}: MetricWithProvenanceProps) {
  const [open, setOpen] = useState(false);
  const sci = metric.provenance.scientificConfidence;
  const value = asPercent ? fmtPct(metric.value) : metric.value.toPrecision(4);

  return (
    <Card className={`space-y-3 ${className}`} padded>
      <div className="flex items-start justify-between gap-2">
        <span className="text-label text-text-muted">{label}</span>
        <ScientificConfidenceChip tier={sci.tier} confidence={sci.confidence} />
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className="text-3xl font-bold tracking-tight text-text-primary">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, Math.round(metric.value * 100))}%`,
            backgroundColor: '#2563EB',
          }}
        />
      </div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-caption font-semibold text-electric hover:text-white"
      >
        {open ? 'Hide provenance' : 'Why this number?'}
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? <ProvenancePanel provenance={metric.provenance} /> : null}
    </Card>
  );
}
