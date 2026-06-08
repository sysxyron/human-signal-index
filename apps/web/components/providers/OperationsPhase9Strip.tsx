// =============================================================================
// HSI Phase 9 — OperationsPhase9Strip (ADDITIVE). A small server-safe strip for
// the Operations console: a "Dead-letter queue" link card + a compact recent-
// provider-runs preview. The caller resolves runs defensively (null on failure)
// so this never breaks the host page.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import { Skull, Plug, ArrowRight } from 'lucide-react';
import type { HsinProviderRunRecord } from '@hsi/shared-types';
import { relativeTime, titleize } from '@/lib/operations/phase9-view';
import { ProviderRunBadge } from './ProviderReasonBadge';

export function OperationsPhase9Strip({
  runs,
  demo = false,
}: {
  runs: HsinProviderRunRecord[] | null;
  demo?: boolean;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Link href={'/dashboard/operations/dead-letter' as never} className="block">
        <Card className="flex items-center gap-3" interactive padded>
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-risk/15 text-risk">
            <Skull className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-h6 font-semibold text-text-primary">Dead-letter queue</p>
            <p className="text-caption text-text-muted">Jobs that exhausted every retry</p>
          </div>
          <ArrowRight className="ml-auto h-4 w-4 text-text-muted" />
        </Card>
      </Link>

      <Link href={'/dashboard/providers' as never} className="block">
        <Card className="space-y-2" interactive padded>
          <div className="flex items-center gap-2">
            <Plug className="h-4 w-4 text-electric" />
            <span className="text-h6 font-semibold text-text-primary">Recent provider runs</span>
            {demo ? <span className="text-caption text-warning">(demo)</span> : null}
            <ArrowRight className="ml-auto h-4 w-4 text-text-muted" />
          </div>
          {runs && runs.length > 0 ? (
            <ul className="space-y-1.5">
              {runs.slice(0, 3).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 text-caption">
                  <span className="font-semibold text-text-primary">{titleize(r.provider_name)}</span>
                  <span className="flex items-center gap-2">
                    <ProviderRunBadge run={r} />
                    <span className="text-text-muted">{relativeTime(r.finished_at ?? r.started_at ?? r.created_at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-caption text-text-muted">Open the providers console for adapter health.</p>
          )}
        </Card>
      </Link>
    </div>
  );
}
