// =============================================================================
// HSI Phase 12 — simulation badges/chips (server-safe, pure presentational).
// ScenarioTypeBadge (the 12 scenario types), ConfidenceBandBadge (low/medium/
// high — confidence is NEVER hidden), and ActionBadge (the 5 intervention
// actions). All map a Decorated {label,color,tone} from lib/simulation/view into
// an inline-styled pill matching the @hsi/ui aesthetic.
// =============================================================================

import { type ReactNode } from 'react';
import { cn } from '@hsi/ui';
import type {
  ConfidenceBand,
  CounterfactualActionType,
  CounterfactualScenarioType,
} from '@hsi/shared-types';
import {
  actionDecor,
  bandDecor,
  formatConfidence,
  scenarioDecor,
  type Decorated,
} from '@/lib/simulation/view';

export function SimPill({
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

export function ScenarioTypeBadge({
  type,
}: {
  type?: CounterfactualScenarioType | string | null;
}) {
  return <SimPill decor={scenarioDecor(type)} dot={false} />;
}

export function ActionBadge({
  action,
}: {
  action?: CounterfactualActionType | string | null;
}) {
  return <SimPill decor={actionDecor(action)} />;
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
    <SimPill
      decor={{ ...decor, label: pct ? `${pct} · ${decor.label}` : decor.label }}
      className={prominent ? 'px-3 py-1.5 text-body-sm' : ''}
    />
  );
}
