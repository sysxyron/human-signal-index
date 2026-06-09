// =============================================================================
// HSI Phase 13 — decision badges/chips (server-safe, pure presentational).
// DecisionTypeBadge (5 types), InterventionTypeBadge (12 types), ImpactTypeBadge
// (6 types), ScenarioWinnerBadge, and ConfidenceBandBadge (low/medium/high —
// confidence is NEVER hidden). All map a Decorated {label,color,tone} from
// lib/decision/view into an inline-styled pill matching the @hsi/ui aesthetic.
// =============================================================================

import { type ReactNode } from 'react';
import { cn } from '@hsi/ui';
import type {
  ConfidenceBand,
  DecisionImpactType,
  DecisionType,
  ScenarioWinner,
} from '@hsi/shared-types';
import {
  bandDecor,
  decisionTypeDecor,
  formatConfidence,
  impactTypeDecor,
  interventionDecor,
  winnerDecor,
  type Decorated,
  type InterventionDecor,
} from '@/lib/decision/view';

export function DecisionPill({
  decor,
  dot = true,
  icon,
  className = '',
  title,
}: {
  decor: Decorated;
  dot?: boolean;
  icon?: ReactNode;
  className?: string;
  title?: string;
}) {
  const { label, color } = decor;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-caption font-semibold',
        className,
      )}
      style={{ backgroundColor: `${color}1f`, color, border: `1px solid ${color}55` }}
      title={title ?? decor.description}
    >
      {icon ??
        (dot ? (
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
          />
        ) : null)}
      {label}
    </span>
  );
}

export function DecisionTypeBadge({
  type,
}: {
  type?: DecisionType | string | null;
}) {
  return <DecisionPill decor={decisionTypeDecor(type)} dot={false} />;
}

export function InterventionTypeBadge({
  type,
}: {
  type?: string | null;
}) {
  const decor: InterventionDecor = interventionDecor(type);
  return <DecisionPill decor={decor} title={decor.framing} />;
}

export function ImpactTypeBadge({
  type,
}: {
  type?: DecisionImpactType | string | null;
}) {
  return <DecisionPill decor={impactTypeDecor(type)} dot={false} />;
}

export function ScenarioWinnerBadge({
  winner,
  prominent = false,
}: {
  winner?: ScenarioWinner | string | null;
  prominent?: boolean;
}) {
  return (
    <DecisionPill
      decor={winnerDecor(winner)}
      dot={false}
      className={prominent ? 'px-3 py-1.5 text-body-sm' : ''}
    />
  );
}

/**
 * Confidence band chip. Shows the % AND the honest band label so uncertainty is
 * always visible — never hidden, never rounded up to a claim of certainty.
 */
export function ConfidenceBandBadge({
  band,
  confidence,
  prominent = false,
}: {
  band?: ConfidenceBand | string | null;
  confidence?: number;
  prominent?: boolean;
}) {
  const decor = bandDecor(band);
  const pct = confidence != null ? formatConfidence(confidence) : null;
  return (
    <DecisionPill
      decor={{ ...decor, label: pct ? `${pct} · ${decor.label}` : decor.label }}
      className={prominent ? 'px-3 py-1.5 text-body-sm' : ''}
    />
  );
}
