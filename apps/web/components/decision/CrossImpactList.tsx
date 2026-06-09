// =============================================================================
// HSI Phase 13 — CrossImpactList. Directed cross-narrative impacts grouped by
// SOURCE narrative: source → target with an impact-type badge (amplifies /
// dampens / triggers / competes / reinforces / neutral), a 0..100 impact-strength
// bar, a confidence chip, and the grounded reasoning. Server-safe / presentational.
// Couplings are estimates — confidence + reasoning are always shown.
// =============================================================================

import { Card } from '@hsi/ui';
import { Network, ArrowRight } from 'lucide-react';
import type {
  HsinCrossNarrativeImpactRecord,
  HsinNarrativeRecord,
} from '@hsi/shared-types';
import { ImpactTypeBadge, ConfidenceBandBadge } from './badges';
import {
  bandFromConfidence,
  formatStrength,
  impactTypeDecor,
  toneColor,
} from '@/lib/decision/view';

export function CrossImpactList({
  impacts,
  narratives,
}: {
  impacts: HsinCrossNarrativeImpactRecord[];
  narratives: HsinNarrativeRecord[];
}) {
  const nameOf = new Map(narratives.map((n) => [n.id, n.name]));
  const label = (id: string) => nameOf.get(id) ?? id;

  // Group by source narrative for a readable "from this, affects these" layout.
  const bySource = new Map<string, HsinCrossNarrativeImpactRecord[]>();
  for (const imp of impacts) {
    const arr = bySource.get(imp.source_narrative_id) ?? [];
    arr.push(imp);
    bySource.set(imp.source_narrative_id, arr);
  }

  if (impacts.length === 0) {
    return (
      <p className="text-caption text-text-muted">
        No cross-narrative impacts recorded yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {Array.from(bySource.entries()).map(([sourceId, group]) => (
        <Card key={sourceId} className="space-y-3" padded>
          <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
            <Network className="h-4 w-4 text-electric" />
            {label(sourceId)}
            <span className="text-caption font-normal text-text-muted">
              affects {group.length} narrative{group.length === 1 ? '' : 's'}
            </span>
          </h3>
          <ul className="space-y-3">
            {group
              .slice()
              .sort((a, b) => (b.impact_strength ?? 0) - (a.impact_strength ?? 0))
              .map((imp) => {
                const decor = impactTypeDecor(imp.impact_type);
                const width = Math.min(100, Math.max(0, imp.impact_strength ?? 0));
                return (
                  <li
                    key={imp.id}
                    className="space-y-1.5 rounded-card border border-border bg-surface-2/30 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <ArrowRight className="h-3.5 w-3.5 text-text-muted" />
                      <span className="text-body-sm font-medium text-text-primary">
                        {label(imp.target_narrative_id)}
                      </span>
                      <ImpactTypeBadge type={imp.impact_type} />
                      <ConfidenceBandBadge
                        band={bandFromConfidence(imp.confidence)}
                        confidence={imp.confidence}
                      />
                      <span
                        className="ml-auto text-caption font-semibold tabular-nums"
                        style={{ color: decor.color }}
                      >
                        {formatStrength(imp.impact_strength)}/100
                      </span>
                    </div>
                    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${width}%`, backgroundColor: decor.color }}
                      />
                    </span>
                    {imp.reasoning ? (
                      <p className="text-caption leading-relaxed text-text-secondary">
                        {imp.reasoning}
                      </p>
                    ) : null}
                  </li>
                );
              })}
          </ul>
        </Card>
      ))}
      <p className="text-caption text-text-muted">
        Cross-narrative couplings are estimates of how one narrative moves another
        — each carries a confidence and a reasoning line.
      </p>
    </div>
  );
}
