'use client';

import { Card } from '@hsi/ui';
import {
  COVERAGE_STYLES,
  coverageScoreColor,
  modeStyle,
  type EvidenceCoverageSummary,
} from '@/lib/worldforge/evidence-view';

export interface EvidenceCoveragePanelProps {
  coverage: EvidenceCoverageSummary;
  /** Total distinct evidence sources gathered (shown beside the ring). */
  sourceCount: number;
  className?: string;
}

/** Header panel: coverage ring + mode badge + color-coded claim counts. */
export function EvidenceCoveragePanel({
  coverage,
  sourceCount,
  className = '',
}: EvidenceCoveragePanelProps) {
  const m = modeStyle(coverage.mode);
  const ModeIcon = m.icon;
  const score = Math.max(0, Math.min(100, Math.round(coverage.coverageScore)));
  const ringColor = coverageScoreColor(score);

  const counts: { key: keyof typeof COVERAGE_STYLES; value: number }[] = [
    { key: 'supported', value: coverage.supported },
    { key: 'contradicted', value: coverage.contradicted },
    { key: 'background', value: coverage.background },
    { key: 'unsupported', value: coverage.unsupported },
  ];

  return (
    <Card className={`relative overflow-hidden ${className}`} padded>
      <div className="grid-bg absolute inset-0 opacity-30" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        {/* Coverage ring */}
        <div className="flex items-center gap-4">
          <CoverageRing score={score} color={ringColor} />
          <div className="space-y-1.5">
            <h2 className="text-h6 font-semibold text-text-primary">
              Evidence coverage
            </h2>
            <p className="max-w-md text-caption leading-relaxed text-text-muted">
              Share of the run&apos;s {coverage.totalClaims} claims backed by a
              supporting or contradicting source. {sourceCount} distinct source
              {sourceCount === 1 ? '' : 's'} gathered.
            </p>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{ backgroundColor: m.soft, color: m.color, border: `1px solid ${m.border}` }}
              title={m.detail}
            >
              <ModeIcon className="h-3 w-3" />
              {m.label}
            </span>
            {m.isDemo ? (
              <p className="text-[11px] font-medium" style={{ color: m.color }}>
                {m.detail}
              </p>
            ) : null}
          </div>
        </div>

        {/* Counts */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:max-w-md">
          {counts.map(({ key, value }) => {
            const s = COVERAGE_STYLES[key];
            return (
              <div
                key={key}
                className="rounded-lg border px-3 py-2.5"
                style={{ backgroundColor: s.soft, borderColor: s.border }}
              >
                <div className="text-h5 font-bold" style={{ color: s.color }}>
                  {value}
                </div>
                <div className="text-[11px] font-medium" style={{ color: s.color }}>
                  {s.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

/** Compact SVG coverage ring showing the 0..100 coverage score. */
function CoverageRing({ score, color }: { score: number; color: string }) {
  const size = 92;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(148,163,184,0.18)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-h5 font-bold" style={{ color }}>
          {score}
        </span>
        <span className="text-[10px] font-medium text-text-muted">/ 100</span>
      </div>
    </div>
  );
}
