'use client';

// =============================================================================
// HSI Phase 10 — GenealogyNodePanel. Detail panel for a selected genealogy node:
// the narrative plus its parents (incoming edges) and children (outgoing edges),
// each with the typed relationship + confidence + rationale.
// =============================================================================

import { GitBranch, ArrowUp, ArrowDown } from 'lucide-react';
import type {
  HsinNarrativeGenealogyRecord,
  HsinNarrativeRecord,
} from '@hsi/shared-types';
import { formatProbability } from '@/lib/temporal/view';
import { RelationshipBadge } from './Badges';

export function GenealogyNodePanel({
  narrativeId,
  narratives,
  edges,
}: {
  narrativeId: string | null;
  narratives: HsinNarrativeRecord[];
  edges: HsinNarrativeGenealogyRecord[];
}) {
  const names = new Map(narratives.map((n) => [n.id, n.name]));

  if (!narrativeId) {
    return (
      <div className="flex h-full items-center justify-center rounded-card border border-dashed border-border bg-surface/40 p-6 text-center text-caption text-text-muted">
        Select a narrative in the graph to see its lineage (parents &amp; children).
      </div>
    );
  }

  const narrative = narratives.find((n) => n.id === narrativeId);
  // Parents: edges where this narrative is the child → parent is the ancestor.
  const parents = edges.filter((e) => e.child_narrative_id === narrativeId);
  // Children: edges where this narrative is the parent.
  const children = edges.filter((e) => e.parent_narrative_id === narrativeId);

  return (
    <div className="space-y-4 rounded-card border border-border bg-surface/60 p-4">
      <div className="flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-electric" />
        <h4 className="min-w-0 truncate text-h6 font-semibold text-text-primary">
          {narrative?.name ?? narrativeId}
        </h4>
      </div>
      {narrative?.category ? (
        <span className="inline-block rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-text-secondary">
          {narrative.category}
        </span>
      ) : null}

      <Section
        icon={<ArrowUp className="h-3.5 w-3.5" />}
        title="Parents (ancestors)"
        empty="No parent narratives — this looks like a root."
        edges={parents}
        otherId={(e) => e.parent_narrative_id}
        names={names}
      />
      <Section
        icon={<ArrowDown className="h-3.5 w-3.5" />}
        title="Children (descendants)"
        empty="No child narratives derived from this one yet."
        edges={children}
        otherId={(e) => e.child_narrative_id}
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
  edges: HsinNarrativeGenealogyRecord[];
  otherId: (e: HsinNarrativeGenealogyRecord) => string | undefined;
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
            return (
              <li
                key={e.id}
                className="space-y-1 rounded-card border border-border bg-surface-2/40 p-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-body-sm font-medium text-text-primary">
                    {names.get(id) ?? id}
                  </span>
                  <RelationshipBadge relationship={e.relationship} />
                </div>
                <div className="flex flex-wrap gap-x-3 text-[10px] text-text-muted">
                  {e.confidence != null ? (
                    <span>{formatProbability(e.confidence)} confidence</span>
                  ) : null}
                  {e.similarity != null ? (
                    <span>{formatProbability(e.similarity)} similarity</span>
                  ) : null}
                  {e.shared_entities != null ? (
                    <span>{e.shared_entities} shared entities</span>
                  ) : null}
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
