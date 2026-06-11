// =============================================================================
// HSI Phase 16 — TrustDetailPanel. The detail "drawer" for a single trusted
// entity (driven by ?entityType=&entityId= on the trust dashboard). Shows the
// trust ring + band, the explanation FACTORS (every contributing signal with its
// value), the explicit LIMITATIONS (always honest about what the score does not
// know), the trust-history chart, the trust-distribution histogram (with this
// entity highlighted), the override state (logged reason, never silent), and —
// for curators/admins — the TrustOverrideControl. Server-safe; the override
// control is the only client island.
// =============================================================================

import { Card } from '@hsi/ui';
import { CheckCircle2, Info, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import Link from 'next/link';
import type { TrustEntityType, TrustView } from '@hsi/shared-types';
import { TrustBandBadge, EntityTypeBadge } from '@/components/calibration/badges';
import { TrustScoreRing } from '@/components/calibration/TrustScoreRing';
import { TrustHistoryChart } from '@/components/calibration/TrustHistoryChart';
import { TrustDistributionChart } from '@/components/calibration/TrustDistributionChart';
import { TrustOverrideControl } from '@/components/calibration/TrustOverrideControl';
import { formatTrustScore, type TrustHistogramBucket } from '@/lib/calibration/view';

type DbResultLike = { ok: true } | { ok: false; error: string };

export function TrustDetailPanel({
  view,
  histogram,
  overrideAction,
  canOverride,
  demo = false,
  closeHref = '/dashboard/trust',
}: {
  view: TrustView;
  histogram: TrustHistogramBucket[];
  overrideAction: (
    entityType: TrustEntityType,
    entityId: string,
    newScore: number,
    reason: string,
  ) => Promise<DbResultLike>;
  canOverride: boolean;
  demo?: boolean;
  closeHref?: string;
}) {
  return (
    <Card className="space-y-4 border-electric/30" padded>
      {/* Header */}
      <div className="flex items-start gap-4">
        <TrustScoreRing score={view.trustScore} size={64} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <EntityTypeBadge type={view.entityType} />
            <TrustBandBadge band={view.band} />
            {view.overridden ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-warning/50 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
                Overridden
              </span>
            ) : null}
          </div>
          <h3 className="truncate text-h6 font-semibold text-text-primary" title={view.entityId}>
            {view.entityId}
          </h3>
          <p className="text-caption text-text-muted">
            Trust score{' '}
            <span className="font-semibold text-text-secondary">
              {formatTrustScore(view.trustScore)}/100
            </span>{' '}
            — advisory, grounded in observed signals, never a guarantee.
          </p>
        </div>
        <Link
          href={closeHref as never}
          scroll={false}
          aria-label="Close trust detail"
          className="rounded-btn border border-border p-1.5 text-text-muted transition hover:border-electric/50 hover:text-text-primary"
        >
          <X className="h-4 w-4" />
        </Link>
      </div>

      {/* Override notice when overridden (never silent). */}
      {view.overridden ? (
        <div className="rounded-card border border-warning/40 bg-warning/10 px-3 py-2 text-caption text-warning">
          <span className="font-semibold">This score was manually overridden.</span>{' '}
          {view.overrideReason
            ? `Reason: ${view.overrideReason}`
            : 'No reason was recorded — review this override.'}
        </div>
      ) : null}

      {/* Explanation factors */}
      <div className="space-y-2">
        <h4 className="flex items-center gap-2 text-caption font-semibold text-text-primary">
          <Info className="h-3.5 w-3.5 text-electric" /> How this score was computed
        </h4>
        {view.explanation.length === 0 ? (
          <p className="text-caption text-text-muted">No explanation factors recorded.</p>
        ) : (
          <ul className="space-y-1.5">
            {view.explanation.map((factor, i) => (
              <li key={i} className="flex items-start gap-2 text-caption text-text-secondary">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-electric" />
                <span className="leading-relaxed">{factor}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Limitations */}
      <div className="space-y-2">
        <h4 className="flex items-center gap-2 text-caption font-semibold text-text-primary">
          <TriangleAlert className="h-3.5 w-3.5 text-warning" /> Limitations
        </h4>
        {view.limitations.length === 0 ? (
          <p className="text-caption text-text-muted">No limitations recorded.</p>
        ) : (
          <ul className="space-y-1.5">
            {view.limitations.map((lim, i) => (
              <li key={i} className="flex items-start gap-2 text-caption text-text-secondary">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                <span className="leading-relaxed">{lim}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* History + distribution */}
      <div className="grid gap-4 lg:grid-cols-2">
        <TrustHistoryChart history={view.history} />
        <TrustDistributionChart buckets={histogram} highlightScore={view.trustScore} />
      </div>

      {/* Override control (curator/admin only, required reason, logged). */}
      <div className="space-y-2">
        <h4 className="flex items-center gap-2 text-caption font-semibold text-text-primary">
          <ShieldCheck className="h-3.5 w-3.5 text-electric" /> Manual override
        </h4>
        <TrustOverrideControl
          entityType={view.entityType}
          entityId={view.entityId}
          currentScore={view.trustScore}
          action={overrideAction}
          canOverride={canOverride}
          demo={demo}
        />
      </div>
    </Card>
  );
}
