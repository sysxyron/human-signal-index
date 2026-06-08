// =============================================================================
// HSI Phase 9 — ProviderReasonBadge + ReliabilityTierBadge + FusionStatusBadge-
// adjacent pills. Server-safe presentational chips mapping Phase-9 unions →
// colored pills via lib/operations/phase9-view. Never hides a failure reason.
// =============================================================================

import { cn } from '@hsi/ui';
import type {
  HsinProviderRunRecord,
  ProviderReason,
  SourceReliabilityTier,
} from '@hsi/shared-types';
import {
  type Decorated,
  providerReasonDecor,
  providerRunDecor,
  reliabilityTierDecor,
} from '@/lib/operations/phase9-view';

function Pill({ decor, title, className = '' }: { decor: Decorated; title?: string; className?: string }) {
  const { label, color } = decor;
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-caption font-semibold',
        className,
      )}
      style={{ backgroundColor: `${color}1f`, color, border: `1px solid ${color}55` }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
      />
      {label}
    </span>
  );
}

/** Badge for a single provider reason (or "OK" when none). */
export function ProviderReasonBadge({ reason }: { reason?: ProviderReason | string | null }) {
  const decor = providerReasonDecor(reason);
  return <Pill decor={decor} title={decor.description} />;
}

/** Badge for a whole provider run, honoring `ok` + the reason. */
export function ProviderRunBadge({ run }: { run: HsinProviderRunRecord }) {
  const decor = providerRunDecor(run);
  return <Pill decor={decor} title={decor.description} />;
}

/** Badge for a source reliability tier (high/medium/low/unproven). */
export function ReliabilityTierBadge({ tier }: { tier?: SourceReliabilityTier | string | null }) {
  return <Pill decor={reliabilityTierDecor(tier)} />;
}
