// =============================================================================
// HSI Phase 7 — shared badge / chip primitives (server-safe, pure presentational).
// All map a Decorated {label,color,tone} from lib/signals/view into an inline-
// styled pill matching the @hsi/ui aesthetic. No client interactivity here.
// =============================================================================

import { type ReactNode } from 'react';
import { cn } from '@hsi/ui';
import { Sparkles } from 'lucide-react';
import type {
  HsinAlertSeverity,
  HsinAlertStatus,
  HsinSignalCategory,
  HsinSignalStatus,
  HsinSourceStatus,
} from '@hsi/shared-types';
import {
  alertSeverityDecor,
  alertStatusDecor,
  confidenceDecor,
  confidencePct,
  signalCategoryDecor,
  signalStatusDecor,
  sourceHealthDecor,
  sourceStatusDecor,
  watchlistSeverityDecor,
  type Decorated,
} from '@/lib/signals/view';

/* -------------------------------------------------------------------------- */
/* Generic decorated pill                                                      */
/* -------------------------------------------------------------------------- */

export function DecoratedPill({
  decor,
  dot = true,
  icon,
  className = '',
}: {
  decor: Decorated;
  dot?: boolean;
  icon?: ReactNode;
  className?: string;
}) {
  const { label, color } = decor;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-caption font-semibold',
        className,
      )}
      style={{ backgroundColor: `${color}1f`, color, border: `1px solid ${color}55` }}
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

/* -------------------------------------------------------------------------- */
/* Demo label — fixtures are ALWAYS labeled                                    */
/* -------------------------------------------------------------------------- */

export function DemoBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-warning/50 bg-warning/10 px-2.5 py-1 text-caption font-semibold text-warning',
        className,
      )}
      title="Demo data from offline fixtures — not live. Configure Supabase to see real data."
    >
      <Sparkles className="h-3.5 w-3.5" />
      Demo data
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Domain-specific badges                                                      */
/* -------------------------------------------------------------------------- */

export function SourceStatusBadge({ status }: { status: HsinSourceStatus }) {
  return <DecoratedPill decor={sourceStatusDecor(status)} />;
}

export function SourceHealthBadge({ status }: { status?: string }) {
  return <DecoratedPill decor={sourceHealthDecor(status)} />;
}

export function SignalCategoryBadge({
  category,
}: {
  category?: HsinSignalCategory | string;
}) {
  return <DecoratedPill decor={signalCategoryDecor(category)} dot={false} />;
}

export function SignalStatusBadge({ status }: { status: HsinSignalStatus }) {
  return <DecoratedPill decor={signalStatusDecor(status)} />;
}

export function AlertSeverityBadge({
  severity,
}: {
  severity: HsinAlertSeverity;
}) {
  return <DecoratedPill decor={alertSeverityDecor(severity)} />;
}

export function AlertStatusBadge({ status }: { status: HsinAlertStatus }) {
  return <DecoratedPill decor={alertStatusDecor(status)} />;
}

export function WatchlistSeverityBadge({
  severity,
}: {
  severity?: HsinAlertSeverity;
}) {
  return <DecoratedPill decor={watchlistSeverityDecor(severity)} />;
}

/** Confidence chip — shows the % and an honest band tone (never hidden). */
export function ConfidenceChip({ confidence }: { confidence?: number }) {
  const decor = confidenceDecor(confidence);
  return (
    <DecoratedPill
      decor={{ ...decor, label: `${confidencePct(confidence)} · ${decor.label}` }}
      dot
    />
  );
}
