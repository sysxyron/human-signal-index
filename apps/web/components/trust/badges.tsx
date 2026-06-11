// =============================================================================
// HSI Phase 17 — small presentational badges for trust trend / drift kind /
// severity / proposal status / band. Pure, server-safe. Mirror the Phase-16
// DecoratedPill aesthetic but draw from the Phase-17 view decorators.
// =============================================================================

import type {
  ProposalStatus,
  TrustBand,
  TrustDriftKind,
  TrustSeverity,
  TrustTrend,
} from '@hsi/shared-types';
import {
  bandDecor,
  driftDecor,
  severityDecor,
  statusDecor,
  trendDecor,
  type Decorated,
} from '@/lib/trust/view';

function Pill({ decor, title }: { decor: Decorated; title?: string }) {
  return (
    <span
      title={title ?? decor.description}
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold"
      style={{
        color: decor.color,
        backgroundColor: `${decor.color}1f`,
        border: `1px solid ${decor.color}55`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: decor.color }} />
      {decor.label}
    </span>
  );
}

export function TrendBadge({ trend }: { trend?: TrustTrend | string | null }) {
  return <Pill decor={trendDecor(trend)} />;
}

export function DriftKindBadge({ kind }: { kind?: TrustDriftKind | string | null }) {
  return <Pill decor={driftDecor(kind)} />;
}

export function SeverityBadge({ severity }: { severity?: TrustSeverity | string | null }) {
  return <Pill decor={severityDecor(severity)} />;
}

export function ProposalStatusBadge({ status }: { status?: ProposalStatus | string | null }) {
  return <Pill decor={statusDecor(status)} />;
}

export function TrustBandBadge({ band }: { band?: TrustBand | string | null }) {
  return <Pill decor={bandDecor(band)} />;
}
