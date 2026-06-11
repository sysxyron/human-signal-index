// =============================================================================
// HSI Phase 17 — TrustDriftTimeline. A vertical timeline of detected trust-drift
// events: kind + severity + the baseline→current move + the advisory reason and
// recommendation + evidence. Drift only RECOMMENDS — never auto-corrects.
// Pure presentational, server-safe.
// =============================================================================

import { Card } from '@hsi/ui';
import { Waves } from 'lucide-react';
import type { HsinTrustDriftRecord } from '@hsi/shared-types';
import { DriftKindBadge, SeverityBadge } from './badges';
import {
  driftDecor,
  entityTypeDecor,
  formatDateTime,
  formatTrustScore,
  readStringArray,
} from '@/lib/trust/view';

export function TrustDriftTimeline({ events }: { events: HsinTrustDriftRecord[] }) {
  if (events.length === 0) {
    return (
      <Card className="flex items-center gap-2 border-border" padded>
        <Waves className="h-4 w-4 text-text-muted" />
        <p className="text-caption text-text-secondary">No drift events recorded.</p>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {events.map((e) => {
        const decor = driftDecor(e.drift_kind);
        const entity = entityTypeDecor(e.entity_type);
        const evidence = readStringArray(e.evidence);
        return (
          <Card key={e.id} className="border-border" padded>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: decor.color }}
                />
                <span className="text-caption font-medium" style={{ color: entity.color }}>
                  {entity.label}
                </span>
                <span className="text-caption text-text-muted">{e.entity_id}</span>
              </div>
              <div className="flex items-center gap-2">
                <DriftKindBadge kind={e.drift_kind} />
                <SeverityBadge severity={e.severity} />
              </div>
            </div>

            <p className="mt-2 text-caption leading-relaxed text-text-secondary">{e.reason}</p>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption">
              <span className="text-text-muted">
                Baseline{' '}
                <span className="font-semibold text-text-secondary">
                  {formatTrustScore(e.baseline_trust)}
                </span>{' '}
                → current{' '}
                <span className="font-semibold" style={{ color: decor.color }}>
                  {formatTrustScore(e.current_trust)}
                </span>
              </span>
              {typeof e.magnitude === 'number' ? (
                <span className="text-text-muted">
                  magnitude{' '}
                  <span className="tabular-nums text-text-secondary">
                    {(e.magnitude * 100).toFixed(0)}%
                  </span>
                </span>
              ) : null}
              <span className="text-text-muted">{formatDateTime(e.detected_at ?? e.created_at)}</span>
            </div>

            {e.recommendation ? (
              <div className="mt-2 rounded-card border border-border bg-surface/50 p-2 text-[12px] leading-snug text-text-secondary">
                <span className="font-semibold text-text-primary">Recommendation: </span>
                {e.recommendation}
              </div>
            ) : null}

            {evidence.length > 0 ? (
              <ul className="mt-2 ml-4 list-disc space-y-0.5 text-[11px] text-text-muted">
                {evidence.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
