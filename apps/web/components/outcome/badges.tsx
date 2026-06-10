// =============================================================================
// HSI Phase 15 — outcome badges/chips (server-safe, pure presentational).
// OutcomeStatusBadge (5 statuses), OutcomeAlertBadge (type + severity),
// AlertStatusBadge, GovernanceDecisionBadge (5 decisions), and a generic
// OutcomePill. All map a Decorated {label,color,tone} from lib/outcome/view into
// an inline-styled pill matching the @hsi/ui aesthetic. No client interactivity.
// =============================================================================

import { type ReactNode } from 'react';
import { cn } from '@hsi/ui';
import type {
  DecisionAlertStatus,
  GovernanceDecision,
  OutcomeAlertType,
  OutcomeStatus,
} from '@hsi/shared-types';
import {
  alertSeverityDecor,
  alertStatusDecor,
  alertTypeDecor,
  governanceDecor,
  outcomeStatusDecor,
  type Decorated,
} from '@/lib/outcome/view';

export function OutcomePill({
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

export function OutcomeStatusBadge({
  status,
}: {
  status?: OutcomeStatus | string | null;
}) {
  return <OutcomePill decor={outcomeStatusDecor(status)} />;
}

export function GovernanceDecisionBadge({
  decision,
}: {
  decision?: GovernanceDecision | string | null;
}) {
  return <OutcomePill decor={governanceDecor(decision)} dot={false} />;
}

export function AlertStatusBadge({
  status,
}: {
  status?: DecisionAlertStatus | string | null;
}) {
  return <OutcomePill decor={alertStatusDecor(status)} dot={false} />;
}

/**
 * Alert badge — the alert type plus its severity tone. Severity is never hidden:
 * a HIGH/CRITICAL alert is visually distinct so a human triages it first.
 */
export function OutcomeAlertBadge({
  type,
  severity,
}: {
  type?: OutcomeAlertType | string | null;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | string | null;
}) {
  const typeDecor = alertTypeDecor(type);
  const sevDecor = alertSeverityDecor(severity);
  return (
    <span className="inline-flex items-center gap-1.5">
      <OutcomePill decor={typeDecor} />
      {severity ? (
        <OutcomePill
          decor={{ ...sevDecor, label: sevDecor.label }}
          dot={false}
          className="px-2 py-0.5 text-[11px]"
        />
      ) : null}
    </span>
  );
}
