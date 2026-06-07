'use client';

import { provenanceSourceStyle } from '@/lib/worldforge/research-view';

export interface ProvenanceSourceChipProps {
  /** One of the 6 ProvenanceSource categories. */
  source: string;
  /** Use the short label (for dense rows). */
  compact?: boolean;
  className?: string;
}

/** Color-coded chip for one of the 6 traceability sources. */
export function ProvenanceSourceChip({
  source,
  compact = false,
  className = '',
}: ProvenanceSourceChipProps) {
  const s = provenanceSourceStyle(source);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${className}`}
      style={{ backgroundColor: s.soft, color: s.color, border: `1px solid ${s.border}` }}
      title={s.description}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: s.color, boxShadow: `0 0 8px ${s.color}` }}
      />
      {compact ? s.short : s.label}
    </span>
  );
}
