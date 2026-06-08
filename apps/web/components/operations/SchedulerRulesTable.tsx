'use client';

// =============================================================================
// HSI Phase 8 — SchedulerRulesTable. Lists cron-style scheduler rules (source,
// job_type, cron human description, next/last run) with a curator+ enable toggle
// via toggleSchedulerRuleAction. Demo data is read-only.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@hsi/ui';
import { CalendarClock } from 'lucide-react';
import type { HsinSchedulerRuleRecord } from '@hsi/shared-types';
import { toggleSchedulerRuleAction } from '@/lib/operations/actions';
import { describeCron, formatDateTime, relativeTime } from '@/lib/operations/view';
import { ErrorState } from '@/components/signals/states';

export function SchedulerRulesTable({
  rules,
  canManage,
  demo = false,
}: {
  rules: HsinSchedulerRuleRecord[];
  canManage: boolean;
  demo?: boolean;
}) {
  return (
    <Card className="space-y-3" padded>
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <CalendarClock className="h-4 w-4 text-electric" /> Scheduler
        </h3>
        <span className="text-caption text-text-muted">{rules.length} rule(s)</span>
      </div>
      {rules.length === 0 ? (
        <p className="text-body-sm text-text-secondary">
          No scheduler rules configured. Create one below to run captures on a cron
          schedule.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-caption">
            <thead className="text-label text-text-muted">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-medium">Job type</th>
                <th className="py-2 pr-3 font-medium">Source</th>
                <th className="py-2 pr-3 font-medium">Schedule</th>
                <th className="py-2 pr-3 font-medium">Next run</th>
                <th className="py-2 pr-3 font-medium">Last run</th>
                <th className="py-2 pr-3 font-medium">Enabled</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <RuleRow key={r.id} rule={r} canManage={canManage} demo={demo} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function RuleRow({
  rule,
  canManage,
  demo,
}: {
  rule: HsinSchedulerRuleRecord;
  canManage: boolean;
  demo: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(rule.enabled);
  const [error, setError] = useState<string | null>(null);

  const toggle = () => {
    if (demo || !canManage) return;
    setError(null);
    const next = !enabled;
    startTransition(async () => {
      const res = await toggleSchedulerRuleAction(rule.id, next);
      if (res.ok) {
        setEnabled(next);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <>
      <tr className="border-b border-border/60 align-top">
        <td className="py-2 pr-3 font-mono text-text-primary">{rule.job_type}</td>
        <td className="py-2 pr-3 font-mono text-text-muted">
          {rule.source_id ? rule.source_id.slice(0, 8) : 'all sources'}
        </td>
        <td className="py-2 pr-3 text-text-secondary">
          {describeCron(rule.cron_expression)}
          <span className="ml-1 font-mono text-text-muted">({rule.cron_expression})</span>
        </td>
        <td className="py-2 pr-3 text-text-secondary">
          {rule.next_run_at ? relativeTime(rule.next_run_at) : '—'}
        </td>
        <td className="py-2 pr-3 text-text-secondary">{formatDateTime(rule.last_run_at)}</td>
        <td className="py-2 pr-3">
          <button
            type="button"
            onClick={toggle}
            disabled={pending || demo || !canManage}
            aria-pressed={enabled}
            title={
              demo
                ? 'Demo data is read-only'
                : !canManage
                  ? 'Curator role required'
                  : enabled
                    ? 'Disable rule'
                    : 'Enable rule'
            }
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${
              enabled ? 'bg-verified' : 'bg-surface-3'
            }`}
          >
            <span
              className="inline-block h-3.5 w-3.5 rounded-full bg-white transition"
              style={{ transform: enabled ? 'translateX(18px)' : 'translateX(3px)' }}
            />
          </button>
        </td>
      </tr>
      {error ? (
        <tr>
          <td colSpan={6} className="pb-2">
            <ErrorState title="Could not update rule" message={error} />
          </td>
        </tr>
      ) : null}
    </>
  );
}
