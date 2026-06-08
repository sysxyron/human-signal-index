// =============================================================================
// HSI Phase 9 — ReliabilityTable. Per-source reliability profiles: a 0..100 score
// ring, a tier badge (high/medium/low/unproven), the underlying rates, and the
// rationale. Server-safe. Low-reliability sources are never hidden.
// =============================================================================

import { Card } from '@hsi/ui';
import { ShieldCheck } from 'lucide-react';
import type { HsinSourceReliabilityRecord } from '@hsi/shared-types';
import {
  ratePct,
  reliabilityTierFromScore,
  scoreColor,
} from '@/lib/operations/phase9-view';
import { ReliabilityTierBadge } from './ProviderReasonBadge';

/** A compact 0..100 score ring (pure SVG; server-safe). */
export function ScoreRing({ score, size = 44 }: { score?: number; size?: number }) {
  const v = Math.max(0, Math.min(100, score ?? 0));
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (v / 100) * c;
  const color = scoreColor(score);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1F2A44" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fontSize={size * 0.3}
        fontWeight={700}
        fill={color}
      >
        {score == null ? '—' : Math.round(v)}
      </text>
    </svg>
  );
}

export function ReliabilityTable({
  reliabilities,
}: {
  reliabilities: HsinSourceReliabilityRecord[];
}) {
  return (
    <Card className="space-y-4" padded>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <ShieldCheck className="h-4 w-4 text-electric" /> Source reliability
        </h3>
        <span className="text-caption text-text-muted">
          {reliabilities.length} source{reliabilities.length === 1 ? '' : 's'}
        </span>
      </div>
      <p className="text-caption text-text-muted">
        A blended 0–100 score from capture success, block rate, downstream approval and
        contradiction rates. Low and unproven sources are shown — never hidden.
      </p>
      {reliabilities.length === 0 ? (
        <p className="text-body-sm text-text-secondary">No reliability profiles computed yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-caption">
            <thead>
              <tr className="border-b border-border text-left text-label text-text-muted">
                <th className="px-2 py-2 font-medium">Score</th>
                <th className="px-2 py-2 font-medium">Source</th>
                <th className="px-2 py-2 font-medium">Tier</th>
                <th className="px-2 py-2 text-right font-medium">Capture</th>
                <th className="px-2 py-2 text-right font-medium">Blocked</th>
                <th className="px-2 py-2 text-right font-medium">Approved</th>
                <th className="px-2 py-2 text-right font-medium">Contradicted</th>
                <th className="px-2 py-2 text-right font-medium">Signals</th>
              </tr>
            </thead>
            <tbody>
              {reliabilities.map((r) => {
                const tier = r.tier ?? reliabilityTierFromScore(r.reliability_score);
                return (
                  <tr key={r.id} className="border-b border-border/50 align-top last:border-0">
                    <td className="px-2 py-2">
                      <ScoreRing score={r.reliability_score} />
                    </td>
                    <td className="px-2 py-2">
                      <span className="block font-mono text-text-primary" title={r.source_id}>
                        {r.source_id.length > 18 ? `${r.source_id.slice(0, 18)}…` : r.source_id}
                      </span>
                      {r.rationale ? (
                        <span className="mt-1 block max-w-xs text-[11px] text-text-muted">{r.rationale}</span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">
                      <ReliabilityTierBadge tier={tier} />
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-text-secondary">{ratePct(r.capture_success_rate)}</td>
                    <td className="px-2 py-2 text-right font-mono text-text-secondary">{ratePct(r.blocked_rate)}</td>
                    <td className="px-2 py-2 text-right font-mono text-text-secondary">{ratePct(r.approved_rate)}</td>
                    <td className="px-2 py-2 text-right font-mono text-text-secondary">{ratePct(r.contradiction_rate)}</td>
                    <td className="px-2 py-2 text-right font-mono text-text-primary">{r.signal_count ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
