// =============================================================================
// HSI Phase 19 — small presentational badges for publication state + trust band.
// Pure, server-safe.
// =============================================================================

import type { PublicationState } from '@hsi/shared-types';
import { stateDecor, trustBandDecor, type Decorated } from '@/lib/publishing/view';

function Pill({ decor }: { decor: Decorated }) {
  return (
    <span
      title={decor.description}
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold"
      style={{ color: decor.color, backgroundColor: `${decor.color}1f`, border: `1px solid ${decor.color}55` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: decor.color }} />
      {decor.label}
    </span>
  );
}

export function PublicationStateBadge({ state }: { state?: PublicationState | string | null }) {
  return <Pill decor={stateDecor(state)} />;
}

export function TrustBandBadge({ score }: { score?: number | null }) {
  return <Pill decor={trustBandDecor(score)} />;
}
