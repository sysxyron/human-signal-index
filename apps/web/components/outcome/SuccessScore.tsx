// =============================================================================
// HSI Phase 15 — SuccessScoreRing + SuccessScoreBar. Render a 0..100 success
// score (how closely the OBSERVED outcome matched the PREDICTED direction +
// magnitude). The ring is a compact SVG gauge; the bar is an inline meter. Tone
// is honest (high green / mid cyan / low red) — a low score is shown as low, never
// dressed up. Server-safe / presentational.
// =============================================================================

import { formatScore, scoreTone, toneColor } from '@/lib/outcome/view';

/** A compact circular gauge for a 0..100 success score. */
export function SuccessScoreRing({
  score,
  size = 56,
  label,
}: {
  score?: number | null;
  size?: number;
  label?: string;
}) {
  const value = score == null || Number.isNaN(score) ? 0 : Math.max(0, Math.min(100, score));
  const color = toneColor(scoreTone(score));
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (value / 100) * c;

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Success score ${formatScore(score)} of 100`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#1F2A44"
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
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-text-primary font-bold"
          style={{ fontSize: size * 0.28 }}
        >
          {formatScore(score)}
        </text>
      </svg>
      {label ? <span className="text-label text-text-muted">{label}</span> : null}
    </div>
  );
}

/** An inline meter for a 0..100 success score. */
export function SuccessScoreBar({
  score,
  showValue = true,
}: {
  score?: number | null;
  showValue?: boolean;
}) {
  const value = score == null || Number.isNaN(score) ? 0 : Math.max(0, Math.min(100, score));
  const color = toneColor(scoreTone(score));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 min-w-[80px] flex-1 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full"
          style={{ width: `${value}%`, backgroundColor: color, boxShadow: `0 0 8px ${color}80` }}
        />
      </div>
      {showValue ? (
        <span className="w-9 shrink-0 text-right text-caption font-semibold" style={{ color }}>
          {formatScore(score)}
        </span>
      ) : null}
    </div>
  );
}
