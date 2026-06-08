// =============================================================================
// HSI Phase 8 — QueueStatusStrip + OperationsLinkCard + GraphLinkCard.
// Small ADDITIVE widgets embedded on the existing Phase-7 dashboards. All are
// server-safe and defensive: callers pass already-resolved data (or null) so a
// failed extra fetch never breaks the host page.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import { Cog, Network, ArrowRight, Layers, Loader2, XCircle, RotateCw } from 'lucide-react';
import type { OperationsOverview } from '@hsi/shared-types';

/** A compact queue-status strip (queued / running / failed / retrying). */
export function QueueStatusStrip({
  overview,
  demo = false,
}: {
  overview: OperationsOverview;
  demo?: boolean;
}) {
  const items = [
    { label: 'Queued', value: overview.queued, icon: Layers, color: '#3B82F6' },
    { label: 'Running', value: overview.running, icon: Loader2, color: '#8B5CF6' },
    { label: 'Failed', value: overview.failed, icon: XCircle, color: '#EF4444' },
    { label: 'Retrying', value: overview.retrying, icon: RotateCw, color: '#F59E0B' },
  ];
  return (
    <Link
      href={'/dashboard/operations' as never}
      className="block"
      title="Open the operations console"
    >
      <Card className="flex flex-wrap items-center gap-x-6 gap-y-2" interactive padded>
        <span className="flex items-center gap-2 text-label text-text-muted">
          <Cog className="h-4 w-4 text-electric" /> Queue
          {demo ? <span className="text-warning">(demo)</span> : null}
        </span>
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <span key={it.label} className="flex items-center gap-1.5 text-caption">
              <Icon className="h-3.5 w-3.5" style={{ color: it.color }} />
              <span className="text-text-muted">{it.label}</span>
              <span className="font-semibold text-text-primary">{it.value}</span>
            </span>
          );
        })}
        <span className="ml-auto inline-flex items-center gap-1 text-caption font-semibold text-electric">
          Operations <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </Card>
    </Link>
  );
}

/** A card linking to the operations console. */
export function OperationsLinkCard() {
  return (
    <Link href={'/dashboard/operations' as never} className="block">
      <Card className="flex items-center gap-3" interactive padded>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-electric/15 text-electric">
          <Cog className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-h6 font-semibold text-text-primary">Operations console</p>
          <p className="text-caption text-text-muted">
            Queue, scheduler, provider limits & SLA
          </p>
        </div>
        <ArrowRight className="ml-auto h-4 w-4 text-text-muted" />
      </Card>
    </Link>
  );
}

/** A card linking to the narrative graph. */
export function GraphLinkCard() {
  return (
    <Link href={'/dashboard/intelligence/graph' as never} className="block">
      <Card className="flex items-center gap-3" interactive padded>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent">
          <Network className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-h6 font-semibold text-text-primary">Narrative graph</p>
          <p className="text-caption text-text-muted">
            How public narratives relate (entities + edges)
          </p>
        </div>
        <ArrowRight className="ml-auto h-4 w-4 text-text-muted" />
      </Card>
    </Link>
  );
}
