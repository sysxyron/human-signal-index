// =============================================================================
// HSI Phase 16 — TrustScoreRing. A small deterministic SVG progress ring showing
// a 0..100 trust score, coloured by band. Pure presentational, server-safe.
// =============================================================================

import { bandFromScore, bandDecor, formatTrustScore } from '@/lib/calibration/view';

export function TrustScoreRing({
  score,
  size = 56,
  showLabel = true,
}: {
  score?: number | null;
  size?: number;
  showLabel?: boolean;
}) {
  const value = Math.max(0, Math.min(100, score ?? 0));
  const color = bandDecor(bandFromScore(value)).color;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (value / 100) * c;

  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Trust score ${Math.round(value)} of 100`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1F2A44" strokeWidth={stroke} />
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
      </svg>
      {showLabel ? (
        <span
          className="absolute text-caption font-bold"
          style={{ color }}
        >
          {formatTrustScore(value)}
        </span>
      ) : null}
    </span>
  );
}
