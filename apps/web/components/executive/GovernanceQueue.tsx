// =============================================================================
// HSI Phase 22 — GovernanceQueue. The executive review queue + decision log.
// Each queued review shows kind/severity/status and (for curators) the decision
// control (approve/reject/archive — reviewer + reason required, reversible). The
// decision log shows the append-only audit trail. Server-safe shell; the decision
// control is a client island. NEVER auto-governs.
// =============================================================================

import { Card } from '@hsi/ui';
import { Gavel, History, Info } from 'lucide-react';
import type { ExecutiveGovernanceData } from '@hsi/shared-types';
import { formatDateTime } from '@/lib/executive/view';
import { SeverityBadge, KindBadge } from './badges';
import { DecideReviewControl } from './controls';

interface DecideAction {
  (reviewId: string, decision: 'approved' | 'rejected' | 'archived', reviewer: string, reason: string): Promise<{ ok: true } | { ok: false; error: string }>;
}

function readTrail(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : (value && typeof value === 'object' ? (value as Record<string, unknown>).items : undefined);
  return Array.isArray(raw) ? raw.map((x) => String(x)) : [];
}

export function GovernanceQueue({
  data, decideAction, canCurate, demo = false,
}: {
  data: ExecutiveGovernanceData;
  decideAction: DecideAction;
  canCurate: boolean;
  demo?: boolean;
}) {
  const queued = data.reviews.filter((r) => (r.status ?? 'queued') === 'queued');
  return (
    <div className="space-y-6">
      <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
        <p className="text-caption leading-relaxed text-text-secondary">
          Every decision is a <span className="font-semibold text-text-primary">human decision</span> — a reviewer and a
          reason are required, the previous status is preserved, and every decision is reversible and audit-logged.
          Nothing auto-approves, auto-acts, or auto-governs.
        </p>
      </Card>

      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><Gavel className="h-4 w-4 text-electric" /> Review queue ({queued.length})</h3>
        {queued.length === 0 ? (
          <Card className="border-border p-6 text-center text-caption text-text-muted" padded>No items awaiting executive review.</Card>
        ) : (
          queued.map((r) => (
            <Card key={r.id} className="space-y-2 border-border" padded>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-body font-medium text-text-primary">{r.title}</div>
                <span className="text-label text-text-muted">{formatDateTime(r.queued_at ?? r.created_at)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <KindBadge kind={r.kind} />
                <SeverityBadge severity={r.severity} />
              </div>
              <DecideReviewControl reviewId={r.id} action={decideAction} canAct={canCurate} demo={demo} />
            </Card>
          ))
        )}
      </section>

      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><History className="h-4 w-4 text-electric" /> Decision log ({data.decisions.length})</h3>
        {data.decisions.length === 0 ? (
          <Card className="border-border p-6 text-center text-caption text-text-muted" padded>No decisions recorded yet.</Card>
        ) : (
          data.decisions.map((d) => {
            const trail = readTrail(d.audit_trail);
            return (
              <Card key={d.id} className="space-y-1.5 border-border" padded>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-body font-medium text-text-primary">
                    <span className="uppercase">{d.decision}</span> by {d.reviewer}
                    {d.reversible ? <span className="ml-2 rounded-full bg-verified/15 px-2 py-0.5 text-label text-verified">reversible</span> : null}
                  </div>
                  <span className="text-label text-text-muted">{formatDateTime(d.decided_at ?? d.created_at)}</span>
                </div>
                {d.reason ? <p className="text-caption text-text-secondary"><span className="font-semibold text-text-primary">Reason:</span> {d.reason}</p> : null}
                {trail.length > 0 ? (
                  <ul className="space-y-0.5 text-label text-text-muted">
                    {trail.map((t, i) => <li key={i} className="flex gap-1.5"><span className="text-electric">›</span> {t}</li>)}
                  </ul>
                ) : null}
              </Card>
            );
          })
        )}
      </section>
    </div>
  );
}
