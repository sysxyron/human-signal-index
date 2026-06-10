// =============================================================================
// HSI Phase 15 — OutcomeAlertList. Renders the decision-intelligence ALERT feed
// (recommendation_failed / confidence_drift / narrative_spike / forecast_miss /
// resurgence / security_anomaly) with type + severity + status badges, the alert
// message, and its grounded explanation. Alerts NEVER auto-act — they are advisory
// AIDS for a human reviewer. Server-safe / presentational.
// =============================================================================

import { Card } from '@hsi/ui';
import { Bell, Info } from 'lucide-react';
import type { HsinDecisionAlertRecord } from '@hsi/shared-types';
import { OutcomeAlertBadge, AlertStatusBadge } from './badges';
import { formatDateTime } from '@/lib/outcome/view';

export function OutcomeAlertList({
  alerts,
  title = 'Decision alerts',
}: {
  alerts: HsinDecisionAlertRecord[];
  title?: string;
}) {
  // Severity-first ordering so the most urgent advisories surface at the top.
  const sevRank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const ordered = [...alerts].sort(
    (a, b) => (sevRank[a.severity ?? ''] ?? 9) - (sevRank[b.severity ?? ''] ?? 9),
  );

  return (
    <Card className="space-y-3" padded>
      <div className="flex items-center gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <Bell className="h-4 w-4 text-electric" /> {title}
        </h3>
        <span className="ml-auto text-caption text-text-muted">
          advisory — never auto-acts
        </span>
      </div>

      {ordered.length === 0 ? (
        <p className="text-caption text-text-muted">
          No open alerts — the decision-intelligence feed is clear.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {ordered.map((a) => (
            <li
              key={a.id}
              className="space-y-1.5 rounded-card border border-border bg-surface-2/40 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <OutcomeAlertBadge type={a.alert_type} severity={a.severity} />
                <AlertStatusBadge status={a.status} />
                <span className="ml-auto text-caption text-text-muted">
                  {formatDateTime(a.created_at)}
                </span>
              </div>
              {a.message ? (
                <p className="text-body-sm font-medium text-text-primary">{a.message}</p>
              ) : null}
              {a.explanation ? (
                <p className="flex items-start gap-1.5 text-caption leading-relaxed text-text-secondary">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-electric" />
                  {a.explanation}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
