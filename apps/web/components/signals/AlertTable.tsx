'use client';

// =============================================================================
// HSI Phase 7 — Alert Center table. Client component: severity/status/type
// filters + per-alert actions. EVERY alert shows its explanation (alerts must be
// explainable — "no black-box conclusions"). Sorted urgent-first; never hidden.
// =============================================================================

import { useMemo, useState } from 'react';
import { Select } from '@hsi/ui';
import { Bell, Info } from 'lucide-react';
import type {
  HsinAlertSeverity,
  HsinAlertStatus,
  HsinAlertType,
  HsinSignalAlertRecord,
} from '@hsi/shared-types';
import {
  alertTypeLabel,
  formatDateTime,
  relativeTime,
  sortAlertsByUrgency,
} from '@/lib/signals/view';
import { AlertSeverityBadge, AlertStatusBadge } from './badges';
import { AlertActions } from './AlertActions';
import { EmptyState } from './states';

const SEVERITIES: HsinAlertSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const STATUSES: HsinAlertStatus[] = ['open', 'acknowledged', 'escalated', 'resolved'];
const TYPES: HsinAlertType[] = [
  'new_signal',
  'source_changed',
  'narrative_shift',
  'watchlist_match',
  'high_risk_signal',
  'review_escalation',
  'research_created',
  'publication_created',
];

export function AlertTable({
  alerts,
  canAct,
  demo = false,
}: {
  alerts: HsinSignalAlertRecord[];
  canAct: boolean;
  demo?: boolean;
}) {
  const [severity, setSeverity] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');

  const filtered = useMemo(() => {
    const list = alerts.filter((a) => {
      if (severity && a.severity !== severity) return false;
      if (status && a.status !== status) return false;
      if (type && a.alert_type !== type) return false;
      return true;
    });
    return sortAlertsByUrgency(list);
  }, [alerts, severity, status, type]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-44">
          <Select value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="">All severities</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-44">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-52">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {alertTypeLabel(t)}
              </option>
            ))}
          </Select>
        </div>
        <span className="ml-auto text-caption text-text-muted">
          {filtered.length} alert{filtered.length === 1 ? '' : 's'}
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-5 w-5" />}
          title="No alerts match"
          message="Adjust the filters. Alerts are raised by the network as drafts for human review — they are never auto-actioned."
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => (
            <div
              key={a.id}
              className="rounded-card border border-border bg-surface/60 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <AlertSeverityBadge severity={a.severity} />
                    <AlertStatusBadge status={a.status} />
                    <span className="rounded-full border border-border px-2 py-0.5 text-caption text-text-muted">
                      {alertTypeLabel(a.alert_type)}
                    </span>
                  </div>
                  <p className="text-body-sm font-semibold text-text-primary">
                    {a.title ?? alertTypeLabel(a.alert_type)}
                  </p>
                  <p
                    className="flex items-start gap-1.5 text-caption leading-relaxed text-text-secondary"
                    title="Every alert is explainable"
                  >
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted" />
                    {a.explanation ?? 'No explanation recorded for this alert.'}
                  </p>
                  <p
                    className="text-caption text-text-muted"
                    title={formatDateTime(a.created_at)}
                  >
                    Raised {relativeTime(a.created_at)}
                  </p>
                </div>
                <AlertActions alert={a} canAct={canAct} demo={demo} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
