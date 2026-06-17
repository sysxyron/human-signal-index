// =============================================================================
// HSI Phase 45 — Narrative relationship map. A public-safe intelligence graph of
// how narrative types relate, with live volume counts on the six tracked buckets.
// Static taxonomy + real counts (no PII, no raw data). Presentational.
// =============================================================================

import { GitBranch } from 'lucide-react';
import { colorForBucket, type CategoryActivity, type CategoryBucket } from '@/lib/public-intelligence-mapping';

// Parent narrative → related narrative types. Parents are tracked buckets (carry
// live counts); children are sub-narratives (taxonomy only).
const MAP: { parent: CategoryBucket; children: string[] }[] = [
  { parent: 'Influence', children: ['Recruitment', 'Propaganda', 'Misinformation'] },
  { parent: 'Misinformation', children: ['Health', 'Civic', 'Extremism'] },
  { parent: 'Recruitment', children: ['Ideology', 'Mobilization'] },
  { parent: 'Extremism', children: ['Radicalization', 'Targeting'] },
];

export function NarrativeMap({ activity }: { activity: CategoryActivity[] }) {
  const counts = new Map<string, number>(activity.map((a) => [a.category, a.count]));
  return (
    <div className="rounded-card border border-border bg-surface/40 p-5">
      <div className="mb-4 flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-electric" />
        <h2 className="text-label uppercase tracking-wide text-text-muted">Narrative relationship map</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {MAP.map((node) => {
          const color = colorForBucket(node.parent);
          const count = counts.get(node.parent) ?? 0;
          return (
            <div key={node.parent} className="rounded-card border border-border bg-background-deep/40 p-4">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-body-sm font-semibold text-text-primary">{node.parent}</span>
                <span className="ml-auto rounded-full bg-surface-2/60 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-text-secondary">{count}</span>
              </div>
              <ul className="mt-2 space-y-1.5 pl-1">
                {node.children.map((child, i) => {
                  const childCount = counts.get(child);
                  const last = i === node.children.length - 1;
                  return (
                    <li key={child} className="flex items-center gap-2 text-caption text-text-secondary">
                      <span className="font-mono text-text-muted">{last ? '└─' : '├─'}</span>
                      <span>{child}</span>
                      {typeof childCount === 'number' ? (
                        <span className="ml-auto text-[10px] tabular-nums text-text-muted">{childCount}</span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
