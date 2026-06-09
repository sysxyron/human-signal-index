// =============================================================================
// HSI Phase 13 — RiskNarrativeList. The highest-risk narratives surfaced by the
// decision dashboard: name + a 0..100 risk bar with an honest tone. Server-safe.
// Risk here is a directional aid for prioritisation, not a verdict.
// =============================================================================

import { Card } from '@hsi/ui';
import { ShieldAlert } from 'lucide-react';
import { formatRisk, riskTone, toneColor } from '@/lib/decision/view';

interface RiskNarrative {
  narrativeId: string;
  name: string;
  riskScore: number;
}

export function RiskNarrativeList({
  narratives,
  title = 'Highest-risk narratives',
}: {
  narratives: RiskNarrative[];
  title?: string;
}) {
  return (
    <Card className="space-y-3" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <ShieldAlert className="h-4 w-4 text-electric" /> {title}
      </h3>
      {narratives.length === 0 ? (
        <p className="text-caption text-text-muted">
          No elevated-risk narratives recorded yet.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {narratives.map((n) => {
            const tone = riskTone(n.riskScore);
            const color = toneColor(tone);
            const width = Math.min(100, Math.max(0, n.riskScore));
            return (
              <li key={n.narrativeId} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="truncate text-body-sm font-medium text-text-primary"
                    title={n.name}
                  >
                    {n.name}
                  </span>
                  <span
                    className="shrink-0 text-caption font-semibold tabular-nums"
                    style={{ color }}
                  >
                    {formatRisk(n.riskScore)}/100
                  </span>
                </div>
                <span className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${width}%`, backgroundColor: color }}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-caption text-text-muted">
        Directional risk for prioritisation — review the underlying runs before
        acting.
      </p>
    </Card>
  );
}
