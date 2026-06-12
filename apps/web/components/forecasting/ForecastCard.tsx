// =============================================================================
// HSI Phase 21 — ForecastCard. A board card for one forecast: prediction,
// confidence, reliability, status, horizon, signal count. Links to detail.
// Pure presentational, server-safe.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import { TrendingUp } from 'lucide-react';
import type { ForecastBoardRow } from '@hsi/shared-types';
import { ConfidenceBadge, ForecastStatusBadge } from './badges';
import { formatPct } from '@/lib/forecasting/view';

export function ForecastCard({ row }: { row: ForecastBoardRow }) {
  return (
    <Link href={`/dashboard/forecasts/${row.id}` as never} className="block">
      <Card className="space-y-3 border-border transition hover:border-electric/50" padded>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
            <h3 className="text-body-sm font-semibold leading-snug text-text-primary">{row.prediction}</h3>
          </div>
          <ForecastStatusBadge status={row.status} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-caption">
          <span className="font-bold tabular-nums text-text-primary">{formatPct(row.confidence)} <span className="font-normal text-text-muted">confidence</span></span>
          <span className="tabular-nums text-text-secondary">{formatPct(row.reliability)} reliability</span>
          <ConfidenceBadge confidence={row.confidence} />
          {row.horizon ? <span className="text-text-muted">horizon {row.horizon}</span> : null}
          <span className="text-text-muted">{row.signalCount} signal(s)</span>
        </div>
      </Card>
    </Link>
  );
}
