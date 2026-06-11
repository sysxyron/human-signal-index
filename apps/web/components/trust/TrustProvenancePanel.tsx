// =============================================================================
// HSI Phase 17 — TrustProvenancePanel (Core Capability #6). The reusable, NEVER-
// black-box explanation of a trust score: WHY trust exists, WHERE it came from,
// and HOW it changed. Enumerates every factor (value × weight = contribution),
// the documented weights, explicit limitations, and the recent history/trend.
// Surfaced throughout operations / decisions / outcomes / trust dashboards.
//
// Pure presentational, server-safe.
// =============================================================================

import { Card } from '@hsi/ui';
import { Info, Layers } from 'lucide-react';
import type { TrustProvenanceView } from '@hsi/shared-types';
import {
  bandDecor,
  entityTypeDecor,
  formatTrustScore,
  trendDecor,
} from '@/lib/trust/view';
import { TrustScoreRing } from '@/components/calibration/TrustScoreRing';

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function TrustProvenancePanel({
  provenance,
  compact = false,
}: {
  provenance: TrustProvenanceView;
  compact?: boolean;
}) {
  const band = bandDecor(provenance.band);
  const entity = entityTypeDecor(provenance.entityType);
  const factors = [...provenance.factors].sort((a, b) => b.contribution - a.contribution);
  const maxContribution = Math.max(1, ...factors.map((f) => f.contribution));

  return (
    <Card className="space-y-4 border-border" padded>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <TrustScoreRing score={provenance.score} size={compact ? 48 : 56} />
          <div>
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-electric" />
              <h3 className="text-h6 font-semibold text-text-primary">Trust provenance</h3>
            </div>
            <p className="mt-0.5 text-caption text-text-secondary">
              <span style={{ color: entity.color }}>{entity.label}</span>{' '}
              <span className="text-text-muted">{provenance.entityId}</span> ·{' '}
              <span style={{ color: band.color }}>{band.label}</span>
              {provenance.trend ? (
                <>
                  {' '}·{' '}
                  <span style={{ color: trendDecor(provenance.trend.trend).color }}>
                    {trendDecor(provenance.trend.trend).label}
                  </span>
                </>
              ) : null}
            </p>
          </div>
        </div>
      </div>

      <p className="text-caption leading-relaxed text-text-secondary">{provenance.summary}</p>

      {/* Factor breakdown — value × weight = contribution. */}
      <div className="space-y-2">
        <div className="text-label uppercase tracking-wide text-text-muted">
          Inputs &amp; weights
        </div>
        {factors.map((f) => (
          <div key={f.name} className="space-y-1">
            <div className="flex items-center justify-between text-caption">
              <span className="font-medium text-text-primary">
                {f.name}
                {!f.present ? (
                  <span className="ml-1 text-text-muted">(neutral default)</span>
                ) : null}
              </span>
              <span className="tabular-nums text-text-secondary">
                {pct(f.value)} × {f.weight} ={' '}
                <span className="font-semibold text-text-primary">
                  {formatTrustScore(f.contribution)}
                </span>
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(f.contribution / maxContribution) * 100}%`,
                  backgroundColor: f.present ? '#3B82F6' : '#94A3B8',
                }}
              />
            </div>
            {!compact ? (
              <p className="text-[11px] leading-snug text-text-muted">{f.detail}</p>
            ) : null}
          </div>
        ))}
      </div>

      {/* Limitations — always shown; trust is never a certainty. */}
      <div className="space-y-1 rounded-card border border-border bg-surface/50 p-3">
        <div className="flex items-center gap-1.5 text-label uppercase tracking-wide text-text-muted">
          <Info className="h-3.5 w-3.5" /> Limitations
        </div>
        <ul className="ml-4 list-disc space-y-0.5 text-[12px] leading-snug text-text-secondary">
          {provenance.limitations.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
