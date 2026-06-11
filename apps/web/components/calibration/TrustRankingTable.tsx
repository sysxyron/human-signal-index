// =============================================================================
// HSI Phase 16 — TrustRankingTable. One ranked section of the trust dashboard
// (sources / narratives / forecasts / decisions). Each row: a trust-score ring +
// the 0..100 score, the band badge, confidence, evidence count, calibration
// score, last-updated, and an OVERRIDDEN flag when a human has overridden the
// computed score (never silent). Rows link to the detail drawer via querystring.
// Server-safe.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import { ListOrdered, PencilLine } from 'lucide-react';
import type { TrustEntityType } from '@hsi/shared-types';
import { TrustBandBadge } from '@/components/calibration/badges';
import { TrustScoreRing } from '@/components/calibration/TrustScoreRing';
import {
  entityTypeDecor,
  formatDate,
  formatRate,
  formatTrustScore,
  type TrustRow,
} from '@/lib/calibration/view';

/** Build the querystring link to the trust detail drawer for a row. */
function detailHref(
  basePath: string,
  search: Record<string, string | undefined>,
  row: TrustRow,
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(search)) {
    if (v) params.set(k, v);
  }
  params.set('entityType', row.entityType);
  params.set('entityId', row.entityId);
  const qs = params.toString();
  return `${basePath}${qs ? `?${qs}` : ''}`;
}

export function TrustRankingTable({
  type,
  rows,
  basePath = '/dashboard/trust',
  search = {},
  selectedEntityId,
}: {
  type: TrustEntityType;
  rows: TrustRow[];
  basePath?: string;
  search?: Record<string, string | undefined>;
  selectedEntityId?: string;
}) {
  const decor = entityTypeDecor(type);

  return (
    <Card className="space-y-3" padded>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <ListOrdered className="h-4 w-4" style={{ color: decor.color }} /> {decor.label} trust
        </h3>
        <span className="text-caption text-text-muted">{rows.length} ranked</span>
      </div>

      {rows.length === 0 ? (
        <p className="text-caption text-text-muted">No {decor.label.toLowerCase()} trust scores yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const active = row.entityId === selectedEntityId;
            return (
              <li key={`${row.entityType}-${row.entityId}`}>
                <Link
                  href={detailHref(basePath, search, row) as never}
                  scroll={false}
                  className={`flex items-center gap-3 rounded-card border bg-surface-2/40 p-3 transition hover:border-electric/50 ${
                    active ? 'border-electric/60' : 'border-border'
                  }`}
                >
                  <TrustScoreRing score={row.trustScore} size={48} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-body-sm font-semibold text-text-primary" title={row.entityId}>
                        {row.entityId}
                      </span>
                      <TrustBandBadge band={row.band} />
                      {row.overridden ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-warning/50 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
                          <PencilLine className="h-3 w-3" /> Overridden
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-caption text-text-muted">
                      <span>score <span className="font-semibold text-text-secondary">{formatTrustScore(row.trustScore)}/100</span></span>
                      <span>conf {formatRate(row.confidence, 0)}</span>
                      <span>evidence {row.evidenceCount}</span>
                      <span>calib {formatRate(row.calibrationScore, 0)}</span>
                      <span>updated {formatDate(row.lastUpdated)}</span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
