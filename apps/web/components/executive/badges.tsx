// =============================================================================
// HSI Phase 22 — executive badges (server-safe presentational). Attention level,
// severity, priority kind, and score → colored pills. Pure; no client state.
// =============================================================================

import {
  attentionDecor, kindDecor, scoreBand, severityDecor,
  type Decorated,
} from '@/lib/executive/view';
import type { ExecutiveAttentionLevel, ExecutivePriorityKind, ExecutiveSeverityLevel } from '@hsi/shared-types';

function Pill({ d }: { d: Decorated }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-label font-semibold uppercase tracking-wide"
      style={{ backgroundColor: `${d.color}1f`, color: d.color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: d.color }} />
      {d.label}
    </span>
  );
}

export function AttentionBadge({ level }: { level?: ExecutiveAttentionLevel | string | null }) {
  return <Pill d={attentionDecor(level)} />;
}
export function SeverityBadge({ severity }: { severity?: ExecutiveSeverityLevel | string | null }) {
  return <Pill d={severityDecor(severity)} />;
}
export function KindBadge({ kind }: { kind?: ExecutivePriorityKind | string | null }) {
  return <Pill d={kindDecor(kind)} />;
}
export function ScoreBadge({ score }: { score?: number | null }) {
  return <Pill d={scoreBand(score)} />;
}
