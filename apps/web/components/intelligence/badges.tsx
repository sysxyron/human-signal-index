// =============================================================================
// HSI Phase 18 — small presentational badges for run state / priority / health /
// severity / task state. Pure, server-safe.
// =============================================================================

import type {
  EngineHealthStatus,
  EscalationSeverity,
  ResearchPriority,
  ResearchRunState,
  ResearchTaskState,
} from '@hsi/shared-types';
import {
  healthDecor,
  priorityDecor,
  runStateDecor,
  severityDecor,
  taskStateDecor,
  type Decorated,
} from '@/lib/orchestration/view';

function Pill({ decor }: { decor: Decorated }) {
  return (
    <span
      title={decor.description}
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold"
      style={{ color: decor.color, backgroundColor: `${decor.color}1f`, border: `1px solid ${decor.color}55` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: decor.color }} />
      {decor.label}
    </span>
  );
}

export function RunStateBadge({ state }: { state?: ResearchRunState | string | null }) {
  return <Pill decor={runStateDecor(state)} />;
}
export function PriorityBadge({ priority }: { priority?: ResearchPriority | string | null }) {
  return <Pill decor={priorityDecor(priority)} />;
}
export function HealthBadge({ status }: { status?: EngineHealthStatus | string | null }) {
  return <Pill decor={healthDecor(status)} />;
}
export function SeverityBadge({ severity }: { severity?: EscalationSeverity | string | null }) {
  return <Pill decor={severityDecor(severity)} />;
}
export function TaskStateBadge({ state }: { state?: ResearchTaskState | string | null }) {
  return <Pill decor={taskStateDecor(state)} />;
}
