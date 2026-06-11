// =============================================================================
// HSI Phase 17 — TrustHistoryRankingTable. Ranks tracked entities by latest trust
// score with their trend, net change, snapshot count, and a sparkline. Each row
// links to the entity's full trust-history view. Pure presentational, server-safe.
// =============================================================================

import Link from 'next/link';
import { Card } from '@hsi/ui';
import type { TrustHistoryRow } from '@hsi/shared-types';
import { TrendBadge } from './badges';
import { Sparkline } from './Sparkline';
import {
  bandDecor,
  entityTypeDecor,
  formatDelta,
  formatTrustScore,
} from '@/lib/trust/view';

export function TrustHistoryRankingTable({ rows }: { rows: TrustHistoryRow[] }) {
  if (rows.length === 0) {
    return (
      <Card className="border-border" padded>
        <p className="text-caption text-text-secondary">No trust history yet.</p>
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden border-border" padded={false}>
      <table className="w-full text-caption">
        <thead>
          <tr className="border-b border-border text-left text-label uppercase tracking-wide text-text-muted">
            <th className="px-4 py-2.5 font-medium">Entity</th>
            <th className="px-4 py-2.5 font-medium">Trust</th>
            <th className="px-4 py-2.5 font-medium">Trend</th>
            <th className="px-4 py-2.5 font-medium">Δ</th>
            <th className="px-4 py-2.5 font-medium">History</th>
            <th className="px-4 py-2.5 font-medium">Snapshots</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const entity = entityTypeDecor(r.entityType);
            const band = bandDecor(r.band);
            return (
              <tr
                key={`${r.entityType}:${r.entityId}`}
                className="border-b border-border/60 transition hover:bg-surface-2/50"
              >
                <td className="px-4 py-2.5">
                  <Link
                    href={
                      `/dashboard/trust/history?entityType=${r.entityType}&entityId=${encodeURIComponent(r.entityId)}` as never
                    }
                    className="inline-flex items-center gap-2 hover:underline"
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: entity.color }} />
                    <span className="font-medium" style={{ color: entity.color }}>
                      {entity.label}
                    </span>
                    <span className="text-text-muted">{r.entityId}</span>
                  </Link>
                </td>
                <td className="px-4 py-2.5">
                  <span className="font-bold tabular-nums" style={{ color: band.color }}>
                    {formatTrustScore(r.latestScore)}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <TrendBadge trend={r.trend} />
                </td>
                <td className="px-4 py-2.5 tabular-nums text-text-secondary">{formatDelta(r.delta)}</td>
                <td className="px-4 py-2.5">
                  <Sparkline series={r.sparkline} />
                </td>
                <td className="px-4 py-2.5 tabular-nums text-text-muted">{r.snapshotCount}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
