'use client';

import { tierStyle } from '@/lib/worldforge/confidence';

export interface ScientificConfidenceChipProps {
  tier: string;
  /** Optional 0..1 numeric confidence to display alongside the tier. */
  confidence?: number;
  /** Optional override label. */
  label?: string;
  className?: string;
}

/** Color-coded chip for a node's scientific-confidence tier. */
export function ScientificConfidenceChip({
  tier,
  confidence,
  label,
  className = '',
}: ScientificConfidenceChipProps) {
  const s = tierStyle(tier);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${className}`}
      style={{ backgroundColor: s.soft, color: s.color, border: `1px solid ${s.border}` }}
      title={tier}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: s.color, boxShadow: `0 0 8px ${s.color}` }}
      />
      {label ?? s.label}
      {typeof confidence === 'number' ? (
        <span className="opacity-70">· {Math.round(confidence * 100)}%</span>
      ) : null}
    </span>
  );
}

/** Horizontal legend of all tiers — green → red. */
export function ScientificConfidenceLegend({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <ScientificConfidenceChip tier="known-science" />
      <ScientificConfidenceChip tier="plausible-science" />
      <ScientificConfidenceChip tier="speculative" />
      <ScientificConfidenceChip tier="fictional" />
      <ScientificConfidenceChip tier="violates-known-physics" />
    </div>
  );
}
