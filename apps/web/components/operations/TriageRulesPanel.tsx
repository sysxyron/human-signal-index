// =============================================================================
// HSI Phase 8 — TriageRulesPanel. Lists declarative triage rules (name, enabled,
// conditions, actions). Triage actions are DRAFTS/requests for human review —
// nothing is auto-actioned. Server-safe, purely presentational.
// =============================================================================

import { Card } from '@hsi/ui';
import { Filter, CheckCircle2, Circle } from 'lucide-react';
import type { HsinTriageRuleRecord } from '@hsi/shared-types';
import { titleize } from '@/lib/operations/view';

function condText(c: Record<string, unknown>): string {
  const field = typeof c.field === 'string' ? titleize(c.field) : 'field';
  const op = typeof c.op === 'string' ? c.op : '?';
  const value =
    c.value === undefined || c.value === null
      ? ''
      : typeof c.value === 'object'
        ? JSON.stringify(c.value)
        : String(c.value);
  const opLabel: Record<string, string> = {
    gte: '≥',
    lte: '≤',
    eq: '=',
    in: 'in',
    is_true: 'is true',
  };
  const o = opLabel[op] ?? op;
  return op === 'is_true' ? `${field} ${o}` : `${field} ${o} ${value}`;
}

function actionText(a: Record<string, unknown>): string {
  const type = typeof a.type === 'string' ? titleize(a.type) : 'action';
  const params = a.params && typeof a.params === 'object'
    ? Object.entries(a.params as Record<string, unknown>)
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join(', ')
    : '';
  return params ? `${type} (${params})` : type;
}

export function TriageRulesPanel({
  rules,
}: {
  rules: HsinTriageRuleRecord[];
}) {
  return (
    <Card className="space-y-4" padded>
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <Filter className="h-4 w-4 text-electric" /> Triage rules
        </h3>
        <span className="text-caption text-text-muted">{rules.length} rule(s)</span>
      </div>
      <p className="text-caption text-text-muted">
        Conditions are ANDed; on a match the actions are requested as DRAFTS for
        human review — never auto-actioned.
      </p>
      {rules.length === 0 ? (
        <p className="text-body-sm text-text-secondary">No triage rules configured.</p>
      ) : (
        <ul className="space-y-3">
          {rules.map((r) => (
            <li
              key={r.id}
              className="space-y-2 rounded-card border border-border bg-surface-2/40 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-text-primary">{r.name}</span>
                <span
                  className={`inline-flex items-center gap-1 text-caption font-semibold ${
                    r.enabled ? 'text-verified' : 'text-text-muted'
                  }`}
                >
                  {r.enabled ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <Circle className="h-3.5 w-3.5" />
                  )}
                  {r.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              {r.description ? (
                <p className="text-caption text-text-secondary">{r.description}</p>
              ) : null}
              <div className="flex flex-wrap gap-1.5">
                {r.conditions_json.map((c, i) => (
                  <span
                    key={i}
                    className="rounded-full border border-electric/30 bg-electric/10 px-2 py-0.5 text-[11px] text-electric"
                  >
                    {condText(c)}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {r.actions_json.map((a, i) => (
                  <span
                    key={i}
                    className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] text-warning"
                  >
                    → {actionText(a)}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
