import { Card } from '@hsi/ui';
import {
  FileBarChart,
  ListChecks,
  AlertTriangle,
  Users,
  StickyNote,
  Database,
  Percent,
} from 'lucide-react';
import { ConfidenceScore } from '@/components/worldforge/research/ConfidenceScore';
import { readPublicReport, claimToText, fmtPercent } from '@/lib/governance/view';

/**
 * Renders a publication snapshot (snapshot_json) as a PublicReportDraft:
 * Executive Summary, Key Claims, Evidence Summary, Support Ratio, Contradictions,
 * Consensus, Reviewer Notes, and Publication Metadata. Contradictions are always
 * surfaced as their own section — never hidden — per HSI transparency.
 */
export function PublicReportView({
  snapshot,
}: {
  snapshot: Record<string, unknown> | null | undefined;
}) {
  const report = readPublicReport(snapshot);

  const evidenceEntries = Object.entries(report.evidenceSummary).filter(
    ([, v]) => typeof v === 'number' || typeof v === 'string',
  );
  const consensusEntries = Object.entries(report.consensus).filter(
    ([, v]) => typeof v === 'number' || typeof v === 'string',
  );
  const metadataEntries = Object.entries(report.metadata).filter(
    ([, v]) => typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean',
  );

  return (
    <div className="space-y-5">
      {/* Executive summary */}
      <Card className="space-y-2" padded>
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <FileBarChart className="h-4 w-4 text-electric" /> Executive summary
        </h3>
        {report.executiveSummary ? (
          <p className="whitespace-pre-wrap text-body-sm leading-relaxed text-text-secondary">
            {report.executiveSummary}
          </p>
        ) : (
          <p className="text-caption text-text-muted">No executive summary in this snapshot.</p>
        )}
        {report.supportRatio !== undefined ? (
          <div className="flex items-center gap-3 pt-1">
            <ConfidenceScore
              score={report.supportRatio <= 1 ? report.supportRatio * 100 : report.supportRatio}
              variant="bar"
              label="Support ratio"
              className="w-48"
            />
            <span className="inline-flex items-center gap-1 text-caption text-text-muted">
              <Percent className="h-3.5 w-3.5" />
              {fmtPercent(report.supportRatio)} of claims supported
            </span>
          </div>
        ) : null}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Key claims */}
        <Card className="space-y-2" padded>
          <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
            <ListChecks className="h-4 w-4 text-electric" /> Key claims
            <span className="text-caption text-text-muted">({report.keyClaims.length})</span>
          </h3>
          {report.keyClaims.length > 0 ? (
            <ul className="space-y-1.5">
              {report.keyClaims.map((c, i) => (
                <li
                  key={i}
                  className="rounded-card border border-border bg-surface-2/40 px-3 py-2 text-body-sm text-text-secondary"
                >
                  {claimToText(c)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-caption text-text-muted">No key claims recorded.</p>
          )}
        </Card>

        {/* Contradictions — always shown */}
        <Card
          className={`space-y-2 ${report.contradictions.length > 0 ? 'border-warning/40' : ''}`}
          padded
        >
          <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
            <AlertTriangle
              className={`h-4 w-4 ${report.contradictions.length > 0 ? 'text-warning' : 'text-text-muted'}`}
            />
            Contradictions
            <span className="text-caption text-text-muted">({report.contradictions.length})</span>
          </h3>
          {report.contradictions.length > 0 ? (
            <ul className="space-y-1.5">
              {report.contradictions.map((c, i) => (
                <li
                  key={i}
                  className="rounded-card border border-warning/30 bg-warning/5 px-3 py-2 text-body-sm text-text-secondary"
                >
                  {claimToText(c)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-caption text-text-muted">
              No contradictions surfaced for this report. (Disagreement is never hidden.)
            </p>
          )}
        </Card>

        {/* Evidence summary */}
        <Card className="space-y-2" padded>
          <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
            <Database className="h-4 w-4 text-electric" /> Evidence summary
          </h3>
          {evidenceEntries.length > 0 ? (
            <KeyValueGrid entries={evidenceEntries} />
          ) : (
            <p className="text-caption text-text-muted">No evidence summary recorded.</p>
          )}
        </Card>

        {/* Consensus */}
        <Card className="space-y-2" padded>
          <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
            <Users className="h-4 w-4 text-electric" /> Consensus
          </h3>
          {consensusEntries.length > 0 ? (
            <KeyValueGrid entries={consensusEntries} />
          ) : (
            <p className="text-caption text-text-muted">No consensus summary recorded.</p>
          )}
        </Card>
      </div>

      {/* Reviewer notes */}
      <Card className="space-y-2" padded>
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <StickyNote className="h-4 w-4 text-electric" /> Reviewer notes
        </h3>
        {report.reviewerNotes.length > 0 ? (
          <ul className="space-y-1.5">
            {report.reviewerNotes.map((n, i) => (
              <li
                key={i}
                className="rounded-card border border-border bg-surface-2/40 px-3 py-2 text-body-sm text-text-secondary"
              >
                {n}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-caption text-text-muted">No reviewer notes attached.</p>
        )}
      </Card>

      {/* Metadata */}
      {metadataEntries.length > 0 ? (
        <Card className="space-y-2" padded>
          <h3 className="text-h6 font-semibold text-text-primary">Publication metadata</h3>
          <KeyValueGrid entries={metadataEntries} />
        </Card>
      ) : null}
    </div>
  );
}

function KeyValueGrid({ entries }: { entries: [string, unknown][] }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {entries.map(([k, v]) => (
        <div key={k} className="rounded-card border border-border bg-surface-2/40 px-3 py-2">
          <dt className="text-[10px] uppercase tracking-wide text-text-muted">{k}</dt>
          <dd className="mt-0.5 text-body-sm font-medium text-text-primary">{String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}
