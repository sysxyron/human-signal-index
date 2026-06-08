// =============================================================================
// HSI Phase 9 — CommunityList + CommunityLegend. Lists detected narrative
// communities (label, size, member narratives) colored to match the graph, plus
// a legend keyed by the same per-community color. Server-safe.
// =============================================================================

import { Card } from '@hsi/ui';
import { Users } from 'lucide-react';
import type { CommunitiesView, HsinGraphCommunityRecord } from '@hsi/shared-types';
import { communityColor } from '@/lib/operations/phase9-view';

function memberNames(comm: HsinGraphCommunityRecord, names: Map<string, string>): string[] {
  return comm.member_narrative_ids.map((id) => names.get(id) ?? id);
}

/** A compact color legend keyed by community (same colors as the graph). */
export function CommunityLegend({ communities }: { communities: HsinGraphCommunityRecord[] }) {
  if (communities.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {communities.map((c, i) => {
        const color = communityColor(i);
        return (
          <span key={c.id} className="inline-flex items-center gap-1.5 text-caption text-text-secondary">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
            {c.label ?? `Community ${i + 1}`}
          </span>
        );
      })}
    </div>
  );
}

export function CommunityList({ view }: { view: CommunitiesView }) {
  const names = new Map(view.narratives.map((n) => [n.id, n.name]));
  return (
    <Card className="space-y-4" padded>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <Users className="h-4 w-4 text-electric" /> Detected communities
        </h3>
        <span className="text-caption text-text-muted">
          {view.communities.length} communit{view.communities.length === 1 ? 'y' : 'ies'}
        </span>
      </div>
      {view.communities.length === 0 ? (
        <p className="text-body-sm text-text-secondary">
          No communities detected yet. Rebuild communities once the narrative graph has edges.
        </p>
      ) : (
        <ul className="space-y-3">
          {view.communities.map((c, i) => {
            const color = communityColor(i);
            const members = memberNames(c, names);
            return (
              <li key={c.id} className="rounded-card border border-border bg-surface-2/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 font-semibold text-text-primary">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
                    {c.label ?? `Community ${i + 1}`}
                  </span>
                  <span className="rounded-full border border-border px-2 py-0.5 text-caption text-text-muted">
                    {c.size ?? c.member_narrative_ids.length} narratives
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {members.map((name, mi) => (
                    <span
                      key={`${c.id}:${mi}`}
                      className="rounded-full px-2 py-0.5 text-[11px]"
                      style={{ backgroundColor: `${color}1a`, color, border: `1px solid ${color}33` }}
                    >
                      {name}
                    </span>
                  ))}
                </div>
                {c.algorithm ? (
                  <p className="mt-2 text-[11px] text-text-muted">Algorithm: {c.algorithm}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
