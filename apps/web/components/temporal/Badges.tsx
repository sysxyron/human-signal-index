// =============================================================================
// HSI Phase 10 — small presentational primitives for the temporal UI
// (server-safe, pure). ChangeTypeBadge, ForecastStateBadge, RelationshipBadge,
// GrowthDelta. All inline-styled to match the @hsi/ui dark aesthetic.
// =============================================================================

import { cn } from '@hsi/ui';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import type {
  NarrativeChangeType,
  NarrativeForecastState,
  NarrativeGenealogyRelationship,
} from '@hsi/shared-types';
import {
  changeTypeDecor,
  forecastStateDecor,
  formatGrowthPct,
  growthTone,
  relationshipDecor,
  toneColor,
  type Decorated,
} from '@/lib/temporal/view';

function Pill({ decor, className = '' }: { decor: Decorated; className?: string }) {
  const { label, color } = decor;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-caption font-semibold',
        className,
      )}
      style={{ backgroundColor: `${color}1f`, color, border: `1px solid ${color}55` }}
      title={decor.description}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

export function ChangeTypeBadge({ type }: { type?: NarrativeChangeType | string | null }) {
  return <Pill decor={changeTypeDecor(type)} />;
}

export function ForecastStateBadge({
  state,
}: {
  state?: NarrativeForecastState | string | null;
}) {
  return <Pill decor={forecastStateDecor(state)} />;
}

export function RelationshipBadge({
  relationship,
}: {
  relationship?: NarrativeGenealogyRelationship | string | null;
}) {
  return <Pill decor={relationshipDecor(relationship)} />;
}

/** Prominent signed growth percentage, e.g. "+200%" / "-45%". */
export function GrowthDelta({
  pct,
  size = 'md',
}: {
  pct?: number | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const tone = growthTone(pct);
  const color = toneColor(tone);
  const Icon = tone === 'green' ? ArrowUpRight : tone === 'orange' ? ArrowDownRight : Minus;
  const sizeClass =
    size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-body-sm' : 'text-h6';
  return (
    <span
      className={cn('inline-flex items-center gap-1 font-mono font-bold', sizeClass)}
      style={{ color }}
    >
      <Icon className={cn(size === 'lg' ? 'h-5 w-5' : 'h-4 w-4')} />
      {formatGrowthPct(pct)}
    </span>
  );
}
