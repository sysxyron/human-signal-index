// =============================================================================
// HSI Phase 13 — DecisionAuditTrail. Renders the tamper-evident, step-by-step
// audit log for a decision run so a HUMAN can trace EXACTLY how the recommendation
// was reached: sensitivity → ranking → recommendation → limitations, each with a
// data-grounded detail string, plus the decision-output snapshot and the audit's
// own confidence + limitations. NO black-box — the whole chain is shown. Server-
// safe / presentational.
// =============================================================================

import { Card } from '@hsi/ui';
import { ScrollText, Hash } from 'lucide-react';
import type { HsinDecisionAuditRecord } from '@hsi/shared-types';
import { ConfidenceBandBadge } from './badges';
import { LimitationsPanel } from './LimitationsPanel';
import {
  bandFromConfidence,
  formatDateTime,
  readAuditLimitations,
  readAuditLog,
  readDecisionOutput,
} from '@/lib/decision/view';

export function DecisionAuditTrail({
  audit,
}: {
  audit: HsinDecisionAuditRecord;
}) {
  const steps = readAuditLog(audit);
  const output = readDecisionOutput(audit);
  const limitations = readAuditLimitations(audit);

  return (
    <Card className="space-y-4" padded>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <ScrollText className="h-4 w-4 text-electric" /> Decision audit trail
        </h3>
        <ConfidenceBandBadge
          band={bandFromConfidence(audit.confidence)}
          confidence={audit.confidence}
        />
        <span className="ml-auto inline-flex items-center gap-1 text-caption text-text-muted">
          <Hash className="h-3 w-3" />
          {audit.id}
        </span>
      </div>

      <p className="text-caption text-text-muted">
        Every step is logged with a data-grounded detail — no black box. Read the
        chain to see exactly how this recommendation was reached.
      </p>

      {steps.length === 0 ? (
        <p className="text-caption text-text-muted">No audit steps recorded.</p>
      ) : (
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-electric/15 text-[11px] font-semibold text-electric">
                  {i + 1}
                </span>
                {i < steps.length - 1 ? (
                  <span className="mt-1 w-px flex-1 bg-border" aria-hidden />
                ) : null}
              </div>
              <div className="space-y-0.5 pb-1">
                <div className="flex items-center gap-2">
                  <span className="text-body-sm font-semibold capitalize text-text-primary">
                    {s.step}
                  </span>
                  {s.at ? (
                    <span className="text-caption text-text-muted">
                      {formatDateTime(s.at)}
                    </span>
                  ) : null}
                </div>
                <p className="text-caption leading-relaxed text-text-secondary">
                  {s.detail || '—'}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {output.length > 0 ? (
        <div className="space-y-2 border-t border-border pt-3">
          <h4 className="text-label text-text-muted">Decision output snapshot</h4>
          <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {output.map((o) => (
              <div
                key={o.key}
                className="rounded-card border border-border bg-surface-2/40 px-3 py-2"
              >
                <dt className="text-label text-text-muted">{o.label}</dt>
                <dd
                  className="truncate text-caption font-semibold text-text-primary"
                  title={o.value}
                >
                  {o.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      <LimitationsPanel limitations={limitations} title="Audited limitations" />
    </Card>
  );
}
