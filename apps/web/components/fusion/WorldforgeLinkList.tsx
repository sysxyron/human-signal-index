// =============================================================================
// HSI Phase 9 — WorldforgeLinkList. Existing WorldForge fusion links across the
// lifecycle (draft / approved / created / rejected) with their prompt excerpt and
// a link to the created research run when present. Server-safe.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import { GitMerge, ArrowRight } from 'lucide-react';
import type { HsinWorldforgeLinkRecord } from '@hsi/shared-types';
import { excerpt, relativeTime } from '@/lib/operations/phase9-view';
import { FusionStatusBadge } from './FusionStatusBadge';

export function WorldforgeLinkList({ links }: { links: HsinWorldforgeLinkRecord[] }) {
  return (
    <Card className="space-y-4" padded>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <GitMerge className="h-4 w-4 text-electric" /> WorldForge fusion links
        </h3>
        <span className="text-caption text-text-muted">{links.length} link{links.length === 1 ? '' : 's'}</span>
      </div>
      {links.length === 0 ? (
        <p className="text-body-sm text-text-secondary">
          No fusions yet. Draft one from a signal to start a WorldForge research run.
        </p>
      ) : (
        <ul className="space-y-3">
          {links.map((l) => (
            <li key={l.id} className="space-y-2 rounded-card border border-border bg-surface-2/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <FusionStatusBadge status={l.status} />
                <span className="text-caption text-text-muted">updated {relativeTime(l.updated_at)}</span>
              </div>
              {l.prompt_draft ? (
                <p className="text-caption leading-relaxed text-text-secondary">
                  {excerpt(l.prompt_draft, 220)}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
                {l.signal_id ? <span className="font-mono">signal {l.signal_id.slice(0, 10)}…</span> : null}
                {l.narrative_id ? <span className="font-mono">narrative {l.narrative_id.slice(0, 10)}…</span> : null}
                {l.research_run_id ? (
                  <Link
                    href={`/dashboard/worldforge/research/${l.research_run_id}` as never}
                    className="ml-auto inline-flex items-center gap-1 font-semibold text-electric hover:text-white"
                  >
                    Open run <ArrowRight className="h-3 w-3" />
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
