// =============================================================================
// HSI Phase 17 — Sparkline. A tiny inline SVG trend line for a trust series,
// coloured by the latest band. Pure presentational, server-safe.
// =============================================================================

import { bandDecor, bandFromScore, sparkPoints } from '@/lib/trust/view';

export function Sparkline({
  series,
  width = 110,
  height = 28,
}: {
  series: { trustScore: number; at: string }[];
  width?: number;
  height?: number;
}) {
  const pts = sparkPoints(series, width, height);
  if (pts.length === 0) {
    return <span className="text-[10px] text-text-muted">—</span>;
  }
  const last = series[series.length - 1];
  const color = bandDecor(bandFromScore(last.trustScore)).color;
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trust trend sparkline">
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={2.5} fill={color} />
    </svg>
  );
}
