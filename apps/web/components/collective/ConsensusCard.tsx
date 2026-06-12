// =============================================================================
// HSI Phase 20 — ConsensusCard + ConsensusBreakdown + DissentTable.
// The open, explainable consensus surface: the weighted candidate position, the
// agreement/evidence/confidence, the per-position breakdown, the dissent (always
// shown), and the explanation + limitations. Consensus is a CANDIDATE, not truth.
// Pure presentational, server-safe.
// =============================================================================

import { Card } from '@hsi/ui';
import { Scale, Info } from 'lucide-react';
import type { HsinConsensusSnapshotRecord } from '@hsi/shared-types';
import { AgreementBadge } from './badges';
import { formatPct, readDissent, readPositions, readStringArray } from '@/lib/collective/view';

export function ConsensusCard({ snapshot }: { snapshot?: HsinConsensusSnapshotRecord }) {
  if (!snapshot) {
    return (
      <Card className="flex items-center gap-2 border-border" padded>
        <Scale className="h-4 w-4 text-text-muted" />
        <p className="text-caption text-text-secondary">No consensus computed yet — submit findings to form one.</p>
      </Card>
    );
  }
  return (
    <Card className="space-y-3 border-border" padded>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <Scale className="h-4 w-4 text-electric" /> Consensus candidate
        </h3>
        <AgreementBadge score={snapshot.agreement_score} />
      </div>
      <p className="text-body-sm font-semibold text-text-primary">
        {snapshot.consensus_position ?? '— no candidate —'}
      </p>
      <div className="grid grid-cols-3 gap-3 text-caption">
        <Metric label="Agreement" value={formatPct(snapshot.agreement_score)} />
        <Metric label="Evidence" value={formatPct(snapshot.evidence_strength)} />
        <Metric label="Confidence" value={formatPct(snapshot.confidence)} />
      </div>
      <p className="flex items-start gap-1.5 text-[11px] leading-snug text-text-muted">
        <Info className="mt-0.5 h-3 w-3 shrink-0" /> A weighted candidate — not truth. Acceptance requires a human governance decision.
      </p>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-border bg-surface/50 px-2.5 py-1.5 text-center">
      <div className="text-label uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-0.5 font-bold tabular-nums text-text-primary">{value}</div>
    </div>
  );
}

export function ConsensusBreakdown({ snapshot }: { snapshot?: HsinConsensusSnapshotRecord }) {
  const positions = readPositions(snapshot);
  const explanation = readStringArray(snapshot?.explanation);
  const limitations = readStringArray(snapshot?.limitations);
  if (positions.length === 0 && explanation.length === 0) return null;
  return (
    <Card className="space-y-3 border-border" padded>
      <h3 className="text-h6 font-semibold text-text-primary">How the consensus formed</h3>
      {positions.length > 0 ? (
        <div className="space-y-2">
          {positions.map((p) => (
            <div key={p.position} className="space-y-1">
              <div className="flex items-center justify-between text-caption">
                <span className="font-medium text-text-primary">{p.position}</span>
                <span className="tabular-nums text-text-secondary">{formatPct(p.share)} · {p.findingCount} finding(s)</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-electric" style={{ width: `${Math.min(100, p.share * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {explanation.length > 0 ? (
        <ul className="ml-4 list-disc space-y-0.5 text-[12px] text-text-secondary">
          {explanation.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      ) : null}
      {limitations.length > 0 ? (
        <div className="rounded-card border border-border bg-surface/50 p-2">
          <div className="text-label uppercase tracking-wide text-text-muted">Limitations</div>
          <ul className="mt-1 ml-4 list-disc space-y-0.5 text-[11px] text-text-muted">
            {limitations.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

export function DissentTable({ snapshot }: { snapshot?: HsinConsensusSnapshotRecord }) {
  const dissent = readDissent(snapshot);
  return (
    <Card className="space-y-2 border-border" padded>
      <h3 className="text-h6 font-semibold text-text-primary">Dissent — who disagrees & why</h3>
      {dissent.length === 0 ? (
        <p className="text-caption text-text-muted">No recorded dissent.</p>
      ) : (
        <table className="w-full text-caption">
          <thead>
            <tr className="border-b border-border text-left text-label uppercase tracking-wide text-text-muted">
              <th className="py-2 font-medium">Position</th>
              <th className="py-2 font-medium">Share</th>
              <th className="py-2 font-medium">Contributors</th>
              <th className="py-2 font-medium">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {dissent.map((d) => (
              <tr key={d.position} className="border-b border-border/40 last:border-0">
                <td className="py-1.5 text-text-primary">{d.position}</td>
                <td className="py-1.5 tabular-nums text-text-secondary">{formatPct(d.share)}</td>
                <td className="py-1.5 tabular-nums text-text-muted">{d.contributorCount}</td>
                <td className="py-1.5 tabular-nums text-text-secondary">{formatPct(d.evidenceStrength)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
