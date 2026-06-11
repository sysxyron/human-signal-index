// =============================================================================
// HSI Phase 16 — TrustBadge. A small, self-contained trust pill for embedding on
// other surfaces (e.g. the Phase-13 decisions page). Shows the 0..100 trust score
// + band, and links to the entity's trust detail. Always honest that trust is
// advisory. Server-safe, pure presentational.
// =============================================================================

import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import type { TrustEntityType } from '@hsi/shared-types';
import { bandDecor, bandFromScore, formatTrustScore } from '@/lib/calibration/view';

export function TrustBadge({
  entityType,
  entityId,
  trustScore,
  band,
  overridden = false,
  href,
  label = 'Decision trust',
}: {
  entityType: TrustEntityType;
  entityId: string;
  trustScore: number;
  band?: string | null;
  overridden?: boolean;
  href?: string;
  label?: string;
}) {
  const decor = bandDecor(band ?? bandFromScore(trustScore));
  const target =
    href ??
    `/dashboard/trust?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`;

  return (
    <Link
      href={target as never}
      className="inline-flex items-center gap-2 rounded-full border bg-surface-2/40 px-3 py-1 text-caption font-semibold transition hover:border-electric/50"
      style={{ borderColor: `${decor.color}55` }}
      title="Trust is advisory — grounded in observed signals, never a certainty."
    >
      <ShieldCheck className="h-3.5 w-3.5" style={{ color: decor.color }} />
      <span className="text-text-muted">{label}</span>
      <span style={{ color: decor.color }}>{formatTrustScore(trustScore)}/100</span>
      <span style={{ color: decor.color }}>· {decor.label}</span>
      {overridden ? <span className="text-warning">· overridden</span> : null}
    </Link>
  );
}
