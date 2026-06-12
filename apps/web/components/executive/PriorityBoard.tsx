// =============================================================================
// HSI Phase 22 — PriorityBoard. The ranked strategic priorities, high→low, each
// with rank, kind, attention, score, recommendation, and explainable reasoning +
// limitations. Server-safe presentational. Every priority is ADVISORY.
// =============================================================================

import { Card } from '@hsi/ui';
import { Info } from 'lucide-react';
import type { HsinExecutivePriorityRecord } from '@hsi/shared-types';
import { formatScore, readStringArray } from '@/lib/executive/view';
import { AttentionBadge, KindBadge, ScoreBadge } from './badges';

function PriorityRow({ p }: { p: HsinExecutivePriorityRecord }) {
  const explanation = readStringArray(p.explanation);
  const limitations = readStringArray(p.limitations);
  return (
    <Card className="space-y-2 border-border" padded>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-caption font-bold tabular-nums text-text-primary">
            {p.rank ?? '—'}
          </span>
          <div>
            <div className="text-body font-semibold text-text-primary">{p.title}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <KindBadge kind={p.kind} />
              <AttentionBadge level={p.attention_level} />
              <ScoreBadge score={p.score} />
              <span className="text-label tabular-nums text-text-muted">score {formatScore(p.score)}</span>
            </div>
          </div>
        </div>
      </div>
      {p.recommendation ? (
        <p className="text-caption leading-relaxed text-text-secondary"><span className="font-semibold text-text-primary">Recommendation:</span> {p.recommendation}</p>
      ) : null}
      {explanation.length > 0 ? (
        <ul className="space-y-0.5 text-caption text-text-muted">
          {explanation.slice(0, 4).map((e, i) => <li key={i} className="flex gap-1.5"><span className="text-electric">•</span> {e}</li>)}
        </ul>
      ) : null}
      {limitations.length > 0 ? (
        <p className="flex items-start gap-1.5 text-label text-text-muted"><Info className="mt-0.5 h-3 w-3 shrink-0 text-warning" /> {limitations[0]}</p>
      ) : null}
    </Card>
  );
}

export function PriorityBoard({ priorities }: { priorities: HsinExecutivePriorityRecord[] }) {
  if (priorities.length === 0) {
    return <Card className="border-border p-6 text-center text-caption text-text-muted" padded>No strategic priorities — the system is within tolerance.</Card>;
  }
  return <div className="space-y-3">{priorities.map((p) => <PriorityRow key={p.id} p={p} />)}</div>;
}
