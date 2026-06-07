'use client';

import { reliabilityTierStyle, fmtPct01 } from '@/lib/worldforge/evidence-view';

export interface ReliabilityTierChipProps {
  /** 0..1 reliability score of the source. */
  score: number | null | undefined;
  /** Show the numeric percent alongside the tier label. */
  showScore?: boolean;
  className?: string;
}

/** Color-coded chip for a source's reliability tier (high/medium/low/unsupported). */
export function ReliabilityTierChip({
  score,
  showScore = true,
  className = '',
}: ReliabilityTierChipProps) {
  const s = reliabilityTierStyle(score);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${className}`}
      style={{ backgroundColor: s.soft, color: s.color, border: `1px solid ${s.border}` }}
      title={`Source reliability: ${s.label}`}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: s.color, boxShadow: `0 0 8px ${s.color}` }}
      />
      {s.label}
      {showScore && s.tier !== 'unsupported' ? (
        <span className="opacity-70">· {fmtPct01(score)}</span>
      ) : null}
    </span>
  );
}
