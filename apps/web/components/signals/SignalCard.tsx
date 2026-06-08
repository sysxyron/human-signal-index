// =============================================================================
// HSI Phase 7 — SignalCard. Server-safe card for the signal dashboard grid:
// title, source, category / type / status badges, confidence chip (honest),
// captured_at, alert count. Links to the signal detail.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import { ArrowUpRight, AlertTriangle } from 'lucide-react';
import type { SignalWithContext } from '@hsi/shared-types';
import { relativeTime, sourceTypeLabel, titleize } from '@/lib/signals/view';
import {
  ConfidenceChip,
  SignalCategoryBadge,
  SignalStatusBadge,
} from './badges';

export function SignalCard({
  item,
  demo = false,
}: {
  item: SignalWithContext;
  demo?: boolean;
}) {
  const { signal, source, alerts } = item;
  const href = `/dashboard/signals/${signal.id}${demo ? '?demo=1' : ''}`;
  const openAlerts = alerts.filter((a) => a.status === 'open' || a.status === 'escalated');

  return (
    <Card className="flex h-full flex-col gap-3" interactive padded>
      <div className="flex flex-wrap items-center gap-1.5">
        <SignalCategoryBadge category={signal.signal_category} />
        {signal.signal_type ? (
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-text-muted">
            {titleize(String(signal.signal_type))}
          </span>
        ) : null}
        <SignalStatusBadge status={signal.status} />
        <ConfidenceChip confidence={signal.confidence} />
      </div>

      <Link
        href={href as never}
        className="group inline-flex items-start gap-1.5"
      >
        <h3 className="text-h6 font-semibold leading-snug text-text-primary group-hover:text-electric">
          {signal.title}
        </h3>
        <ArrowUpRight className="mt-1 h-3.5 w-3.5 shrink-0 text-text-muted transition group-hover:text-electric" />
      </Link>

      {signal.summary ? (
        <p className="line-clamp-3 text-body-sm leading-relaxed text-text-secondary">
          {signal.summary}
        </p>
      ) : null}

      {openAlerts.length > 0 ? (
        <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-risk/40 bg-risk/10 px-2.5 py-1 text-caption font-semibold text-risk">
          <AlertTriangle className="h-3.5 w-3.5" />
          {openAlerts.length} open alert{openAlerts.length === 1 ? '' : 's'}
        </div>
      ) : null}

      <div className="mt-auto flex items-center justify-between border-t border-border pt-3 text-caption text-text-muted">
        <span className="truncate">
          {source
            ? `${source.name} · ${sourceTypeLabel(source.source_type)}`
            : 'Manual / unknown source'}
        </span>
        <span title={signal.captured_at}>{relativeTime(signal.captured_at ?? signal.created_at)}</span>
      </div>
    </Card>
  );
}
