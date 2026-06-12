// =============================================================================
// HSI Phase 21 — ScenarioTree + ScenarioComparison. The branching scenario tree
// (per-branch probabilities) and the ranked likelihood comparison across
// competing scenarios. Scenario likelihoods are hypotheses, not probabilities of
// truth. Pure presentational, server-safe.
// =============================================================================

import { Card } from '@hsi/ui';
import { GitBranch, BarChart3 } from 'lucide-react';
import type { HsinScenarioComparisonSnapshotRecord, HsinScenarioTreeRecord } from '@hsi/shared-types';
import { formatPct, readStringArray, readTree, type TreeNode } from '@/lib/forecasting/view';
import { ScenarioStateBadge } from './badges';

function TreeBranch({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  return (
    <div>
      <div className="flex items-center gap-2 py-0.5" style={{ paddingLeft: depth * 16 }}>
        {depth > 0 ? <span className="text-text-muted">└</span> : null}
        <span className="text-caption text-text-primary">{node.label}</span>
        <span className="rounded-full bg-electric/10 px-1.5 py-0.5 text-[10px] font-semibold text-electric">{formatPct(node.probability)}</span>
      </div>
      {node.children.map((c) => <TreeBranch key={c.id} node={c} depth={depth + 1} />)}
    </div>
  );
}

export function ScenarioTree({ tree }: { tree?: HsinScenarioTreeRecord }) {
  const node = readTree(tree?.tree);
  return (
    <Card className="space-y-3 border-border" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <GitBranch className="h-4 w-4 text-electric" /> Scenario tree
      </h3>
      {!node ? <p className="text-caption text-text-muted">No scenario tree.</p> : <TreeBranch node={node} />}
    </Card>
  );
}

export function ScenarioComparison({ comparison, ranked }: {
  comparison?: HsinScenarioComparisonSnapshotRecord;
  ranked?: { id: string; title: string; likelihood: number; rank: number; share: number; state?: string }[];
}) {
  const rows = ranked && ranked.length > 0 ? ranked : readRanked(comparison);
  return (
    <Card className="space-y-3 border-border" padded>
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <BarChart3 className="h-4 w-4 text-electric" /> Scenario comparison
        </h3>
        {comparison?.divergence !== undefined ? (
          <span className="text-caption text-text-muted">divergence {formatPct(comparison.divergence)}</span>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="text-caption text-text-muted">No scenarios to compare.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="space-y-1">
              <div className="flex items-center justify-between text-caption">
                <span className="text-text-primary">#{r.rank} {r.title}</span>
                <span className="tabular-nums text-text-secondary">{formatPct(r.likelihood)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-electric" style={{ width: `${Math.min(100, r.likelihood * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
      {comparison ? (
        <>
          <p className="text-[12px] leading-snug text-text-secondary">{comparison.summary}</p>
          {readStringArray(comparison.limitations).length > 0 ? (
            <ul className="ml-4 list-disc space-y-0.5 text-[11px] text-text-muted">{readStringArray(comparison.limitations).map((l, i) => <li key={i}>{l}</li>)}</ul>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

interface RankedRow { id: string; title: string; likelihood: number; rank: number; share: number }
function readRanked(comparison?: HsinScenarioComparisonSnapshotRecord): RankedRow[] {
  const raw = comparison && typeof comparison.ranked === 'object' && !Array.isArray(comparison.ranked)
    ? (comparison.ranked as Record<string, unknown>).items
    : comparison?.ranked;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    .map((r) => ({ id: String(r.id ?? ''), title: String(r.title ?? ''), likelihood: typeof r.likelihood === 'number' ? r.likelihood : 0, rank: typeof r.rank === 'number' ? r.rank : 0, share: typeof r.share === 'number' ? r.share : 0 }));
}

export function ScenarioStateInline({ state }: { state?: string }) {
  return <ScenarioStateBadge state={state} />;
}
