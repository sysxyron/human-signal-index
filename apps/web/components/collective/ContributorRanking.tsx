// =============================================================================
// HSI Phase 20 — ContributorRanking + TrustBreakdown. The contributor leaderboard
// (overall reliability) and the explainable per-contributor breakdown. No hidden
// scoring — every score shows accuracy / trust / review / alignment / evidence +
// explanation + limitations. Pure presentational, server-safe.
// =============================================================================

import { Card } from '@hsi/ui';
import { Trophy, Info } from 'lucide-react';
import type { HsinContributorScoreRecord } from '@hsi/shared-types';
import { formatPct, formatScore, readStringArray } from '@/lib/collective/view';

export function ContributorRanking({ scores }: { scores: HsinContributorScoreRecord[] }) {
  if (scores.length === 0) {
    return (
      <Card className="border-border" padded>
        <p className="text-caption text-text-muted">No contributor scores computed yet.</p>
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden border-border" padded={false}>
      <table className="w-full text-caption">
        <thead>
          <tr className="border-b border-border text-left text-label uppercase tracking-wide text-text-muted">
            <th className="px-4 py-2.5 font-medium">#</th>
            <th className="px-4 py-2.5 font-medium">Contributor</th>
            <th className="px-4 py-2.5 font-medium">Overall</th>
            <th className="px-4 py-2.5 font-medium">Accuracy</th>
            <th className="px-4 py-2.5 font-medium">Review</th>
            <th className="px-4 py-2.5 font-medium">Alignment</th>
            <th className="px-4 py-2.5 font-medium">Evidence</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((s, i) => (
            <tr key={s.id} className="border-b border-border/60">
              <td className="px-4 py-2.5 tabular-nums text-text-muted">{i + 1}</td>
              <td className="px-4 py-2.5 font-medium text-text-primary">{s.contributor_id}</td>
              <td className="px-4 py-2.5"><span className="font-bold tabular-nums text-electric">{formatScore(s.overall)}</span></td>
              <td className="px-4 py-2.5 tabular-nums text-text-secondary">{formatPct(s.accuracy)}</td>
              <td className="px-4 py-2.5 tabular-nums text-text-secondary">{formatPct(s.review_quality)}</td>
              <td className="px-4 py-2.5 tabular-nums text-text-secondary">{formatPct(s.consensus_alignment)}</td>
              <td className="px-4 py-2.5 tabular-nums text-text-secondary">{formatPct(s.evidence_quality)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function TrustBreakdown({ score }: { score: HsinContributorScoreRecord }) {
  const explanation = readStringArray(score.explanation);
  const limitations = readStringArray(score.limitations);
  return (
    <Card className="space-y-3 border-border" padded>
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <Trophy className="h-4 w-4 text-electric" /> {score.contributor_id}
        </h3>
        <span className="text-h5 font-bold tabular-nums text-electric">{formatScore(score.overall)}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-caption sm:grid-cols-5">
        <Metric label="Trust" value={formatScore(score.trust)} />
        <Metric label="Accuracy" value={formatPct(score.accuracy)} />
        <Metric label="Review" value={formatPct(score.review_quality)} />
        <Metric label="Alignment" value={formatPct(score.consensus_alignment)} />
        <Metric label="Evidence" value={formatPct(score.evidence_quality)} />
      </div>
      {explanation.length > 0 ? (
        <ul className="ml-4 list-disc space-y-0.5 text-[12px] text-text-secondary">
          {explanation.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      ) : null}
      {limitations.length > 0 ? (
        <div className="rounded-card border border-border bg-surface/50 p-2">
          <div className="flex items-center gap-1.5 text-label uppercase tracking-wide text-text-muted"><Info className="h-3.5 w-3.5" /> Limitations</div>
          <ul className="mt-1 ml-4 list-disc space-y-0.5 text-[11px] text-text-muted">
            {limitations.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-border bg-surface/50 px-2 py-1.5 text-center">
      <div className="text-label uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-0.5 font-semibold tabular-nums text-text-primary">{value}</div>
    </div>
  );
}
