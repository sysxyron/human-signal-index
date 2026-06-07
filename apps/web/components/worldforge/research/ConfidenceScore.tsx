'use client';

import { scoreColor } from '@/lib/worldforge/research-view';

export interface ConfidenceScoreProps {
  /** 0..100 score. */
  score: number;
  /** Optional caption under/next to the value. */
  label?: string;
  /** Render as a compact ring (default) or a horizontal bar. */
  variant?: 'ring' | 'bar';
  /** Ring diameter in px (ring variant). */
  size?: number;
  className?: string;
}

/** A 0–100 confidence indicator — SVG ring or labelled bar. */
export function ConfidenceScore({
  score,
  label,
  variant = 'ring',
  size = 56,
  className = '',
}: ConfidenceScoreProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const color = scoreColor(clamped);

  if (variant === 'bar') {
    return (
      <div className={`space-y-1 ${className}`}>
        {label ? (
          <div className="flex items-center justify-between text-caption text-text-muted">
            <span>{label}</span>
            <span className="font-semibold" style={{ color }}>
              {clamped}
            </span>
          </div>
        ) : null}
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${clamped}%`, backgroundColor: color }}
          />
        </div>
      </div>
    );
  }

  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (clamped / 100) * c;

  return (
    <div className={`inline-flex flex-col items-center gap-1 ${className}`}>
      <div className="relative" style={{ width: size, height: size }}>
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
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
            style={{ filter: `drop-shadow(0 0 6px ${color}88)` }}
          />
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center text-body-sm font-semibold"
          style={{ color }}
        >
          {clamped}
        </span>
      </div>
      {label ? (
        <span className="text-[11px] font-medium text-text-muted">{label}</span>
      ) : null}
    </div>
  );
}
