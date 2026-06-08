'use client';

// =============================================================================
// HSI Phase 10 — InfluenceNodePanel. Detail panel for a selected influence node:
// the narrative plus the narratives it influences (outgoing) and the narratives
// that influence it (incoming), each with the weighted influence score + rationale.
// =============================================================================

import { Zap, ArrowRight, ArrowLeft } from 'lucide-react';
import type {
  HsinNarrativeInfluenceRecord,
  HsinNarrativeRecord,
} from '@hsi/shared-types';

export function InfluenceNodePanel({
  narrativeId,
  narratives,
  edges,
}: {
  narrativeId: string | null;
  narratives: HsinNarrativeRecord[];
  edges: HsinNarrativeInfluenceRecord[];
}) {
  const names = new Map(narratives.map((n) => [n.id, n.name]));

  if (!narrativeId) {
    return (
      <div className="flex h-full items-center justify-center rounded-card border border-dashed border-border bg-surface/40 p-6 text-center text-caption text-text-muted">
        Select a narrative in the graph to see what it influences and what influences it.
      </div>
    );
  }

  const narrative = narratives.find((n) => n.id === narrativeId);
  const outgoing = edges
    .filter((e) => e.source_narrative_id === narrativeId)
    .sort((a, b) => (b.influence_score ?? 0) - (a.influence_score ?? 0));
  const incoming = edges
    .filter((e) => e.target_narrative_id === narrativeId)
    .sort((a, b) => (b.influence_score ?? 0) - (a.influence_score ?? 0));

  return (
    <div className="space-y-4 rounded-card border border-border bg-surface/60 p-4">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-electric" />
        <h4 className="min-w-0 truncate text-h6 font-semibold text-text-primary">
          {narrative?.name ?? narrativeId}
        </h4>
      </div>

      <Section
        icon={<ArrowRight className="h-3.5 w-3.5" />}
        title="Influences (outgoing)"
        empty="This narrative does not measurably influence others."
        edges={outgoing}
        otherId={(e) => e.target_narrative_id}
        names={names}
      />
      <Section
        icon={<ArrowLeft className="h-3.5 w-3.5" />}
        title="Influenced by (incoming)"
        empty="No other narratives measurably influence this one."
        edges={incoming}
        otherId={(e) => e.source_narrative_id}
        names={names}
      />
    </div>
  );
}

function Section({
  icon,
  title,
  empty,
  edges,
  otherId,
  names,
}: {
  icon: React.ReactNode;
  title: string;
  empty: string;
  edges: HsinNarrativeInfluenceRecord[];
  otherId: (e: HsinNarrativeInfluenceRecord) => string | undefined;
  names: Map<string, string>;
}) {
  return (
    <div className="space-y-2">
      <p className="inline-flex items-center gap-1.5 text-caption font-semibold text-text-secondary">
        {icon} {title}
        <span className="text-text-muted">· {edges.length}</span>
      </p>
      {edges.length === 0 ? (
        <p className="text-[11px] italic text-text-muted">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {edges.map((e) => {
            const id = otherId(e) ?? '';
            const score = Math.round(e.influence_score ?? 0);
            return (
              <li
                key={e.id}
                className="space-y-1 rounded-card border border-border bg-surface-2/40 p-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-body-sm font-medium text-text-primary">
                    {names.get(id) ?? id}
                  </span>
                  <span className="whitespace-nowrap font-mono text-body-sm font-bold text-electric">
                    {score}
                  </span>
                </div>
                {e.rationale ? (
                  <p className="text-[11px] leading-relaxed text-text-secondary">{e.rationale}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
