// =============================================================================
// HSI Phase 13 — InterventionRankingTable. Ranks candidate interventions by the
// engine's (|effect| × confidence ÷ risk) score: rank position, an intervention-
// type badge, expected effect (signed), risk score (0..100), and confidence —
// each shown honestly with its own tone. A reasoning line per row explains why.
// Server-safe / presentational — renders only the rankings it is given.
// =============================================================================

import type { HsinInterventionRankingRecord } from '@hsi/shared-types';
import { InterventionTypeBadge, ConfidenceBandBadge } from './badges';
import {
  bandFromConfidence,
  effectTone,
  formatEffect,
  formatRisk,
  riskTone,
  sortRankings,
  toneColor,
} from '@/lib/decision/view';

export function InterventionRankingTable({
  rankings,
  caption = 'Ranked by expected effect × confidence ÷ risk — every estimate carries its own confidence.',
}: {
  rankings: HsinInterventionRankingRecord[];
  caption?: string;
}) {
  const rows = sortRankings(rankings);

  if (rows.length === 0) {
    return (
      <p className="text-caption text-text-muted">No interventions ranked yet.</p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-card border border-border">
        <table className="w-full min-w-[640px] text-left text-caption">
          <thead className="border-b border-border bg-surface-2/40 text-label text-text-muted">
            <tr>
              <th className="px-3 py-2 font-semibold">#</th>
              <th className="px-3 py-2 font-semibold">Intervention</th>
              <th className="px-3 py-2 font-semibold">Expected effect</th>
              <th className="px-3 py-2 font-semibold">Risk</th>
              <th className="px-3 py-2 font-semibold">Confidence</th>
              <th className="px-3 py-2 font-semibold">Why</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-border/60 last:border-0 align-top hover:bg-surface-2/30"
              >
                <td className="px-3 py-2.5">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-electric/15 text-[11px] font-semibold text-electric">
                    {r.rank_position ?? '—'}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <InterventionTypeBadge type={r.intervention_type} />
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className="inline-flex items-center gap-1.5 font-semibold tabular-nums"
                    style={{ color: toneColor(effectTone(r.expected_effect)) }}
                  >
                    {formatEffect(r.expected_effect)}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-2"
                      aria-hidden
                    >
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${Math.min(100, Math.max(0, r.risk_score ?? 0))}%`,
                          backgroundColor: toneColor(riskTone(r.risk_score)),
                        }}
                      />
                    </span>
                    <span
                      className="font-semibold tabular-nums"
                      style={{ color: toneColor(riskTone(r.risk_score)) }}
                    >
                      {formatRisk(r.risk_score)}
                    </span>
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <ConfidenceBandBadge
                    band={bandFromConfidence(r.confidence)}
                    confidence={r.confidence}
                  />
                </td>
                <td className="max-w-xs px-3 py-2.5 leading-relaxed text-text-secondary">
                  {r.reasoning || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-caption text-text-muted">{caption}</p>
    </div>
  );
}
