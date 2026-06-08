import { Card } from '@hsi/ui';
import { Route, ArrowRight } from 'lucide-react';
import type { ReviewDecisionRecord } from '@hsi/shared-types';
import { decisionStyle, fmtDate, readEntitySummary } from '@/lib/governance/view';

/**
 * Provenance chain for a reviewed entity: Claim -> Evidence -> Reviewer ->
 * Decision -> Timestamp. Built from the entity summary (claim/evidence signals)
 * and the recorded decisions. Following HSI's "no black-box conclusions", every
 * decision in the chain is shown — including rejections and escalations.
 */
export function ReviewProvenancePanel({
  decisions,
  entitySummary,
  reviewerEmails,
}: {
  decisions: ReviewDecisionRecord[];
  entitySummary?: Record<string, unknown> | null;
  reviewerEmails?: Record<string, string>;
}) {
  const summary = readEntitySummary(entitySummary);

  return (
    <Card className="space-y-4" padded>
      <div className="flex items-center gap-2">
        <Route className="h-4 w-4 text-electric" />
        <h3 className="text-h6 font-semibold text-text-primary">Provenance chain</h3>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-caption">
        <Node label="Claim" value={summary.title ?? summary.conceptText ?? 'Entity claims'} />
        <ArrowRight className="h-3.5 w-3.5 text-text-muted" />
        <Node
          label="Evidence"
          value={
            summary.coverageScore !== undefined
              ? `${Math.round(summary.coverageScore)}% coverage`
              : 'Evidence summary'
          }
        />
        <ArrowRight className="h-3.5 w-3.5 text-text-muted" />
        <Node label="Reviewer" value={`${decisions.length} verdict${decisions.length === 1 ? '' : 's'}`} />
      </div>

      {decisions.length === 0 ? (
        <p className="rounded-card border border-border bg-surface-2/40 px-4 py-4 text-center text-caption text-text-muted">
          No reviewer decisions recorded yet.
        </p>
      ) : (
        <ol className="space-y-2">
          {decisions.map((d) => {
            const s = decisionStyle(d.decision);
            const who = d.reviewer_id
              ? (reviewerEmails?.[d.reviewer_id] ?? `${d.reviewer_id.slice(0, 8)}`)
              : 'Unknown reviewer';
            return (
              <li
                key={d.id}
                className="rounded-card border border-border bg-surface-2/40 p-3"
                style={{ borderLeft: `3px solid ${s.color}` }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-caption font-semibold" style={{ color: s.color }}>
                    {s.label}
                  </span>
                  <span className="text-[11px] text-text-muted">{fmtDate(d.created_at)}</span>
                </div>
                <p className="mt-0.5 text-caption text-text-secondary">by {who}</p>
                {d.notes ? (
                  <p className="mt-1 whitespace-pre-wrap text-body-sm leading-relaxed text-text-secondary">
                    {d.notes}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

function Node({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex flex-col rounded-card border border-border bg-surface-2/40 px-3 py-1.5">
      <span className="text-[10px] uppercase tracking-wide text-text-muted">{label}</span>
      <span className="max-w-[200px] truncate text-text-secondary" title={value}>
        {value}
      </span>
    </span>
  );
}
