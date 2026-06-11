// =============================================================================
// HSI Phase 17 — TrustHistoryChart. A deterministic SVG line chart of a trust
// score (0..100) over time, with band guide-lines (70 / 40) and the latest
// point highlighted by its band colour. Pure presentational, server-safe.
// =============================================================================

import { bandDecor, bandFromScore, formatDate } from '@/lib/trust/view';

export function TrustHistoryChart({
  series,
  width = 560,
  height = 180,
}: {
  series: { trustScore: number; at: string }[];
  width?: number;
  height?: number;
}) {
  const padX = 8;
  const padY = 10;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const n = series.length;

  const xy = (i: number, score: number): [number, number] => {
    const x = padX + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = padY + innerH - (Math.max(0, Math.min(100, score)) / 100) * innerH;
    return [x, y];
  };

  const points = series.map((p, i) => xy(i, p.trustScore));
  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const last = series[n - 1];
  const lastColor = last ? bandDecor(bandFromScore(last.trustScore)).color : '#94A3B8';

  const guide = (score: number, label: string, color: string) => {
    const [, y] = xy(0, score);
    return (
      <g key={label}>
        <line x1={padX} y1={y} x2={width - padX} y2={y} stroke={color} strokeWidth={1} strokeDasharray="3 3" opacity={0.4} />
        <text x={padX + 2} y={y - 3} fontSize={9} fill={color} opacity={0.7}>
          {label}
        </text>
      </g>
    );
  };

  if (n === 0) {
    return (
      <div className="flex h-[120px] items-center justify-center text-caption text-text-muted">
        No history yet.
      </div>
    );
  }

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trust score over time">
        {guide(70, 'high 70', '#10B981')}
        {guide(40, 'medium 40', '#F59E0B')}
        <path d={path} fill="none" stroke={lastColor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={i === n - 1 ? 4 : 2.5}
            fill={i === n - 1 ? lastColor : '#1F2A44'}
            stroke={lastColor}
            strokeWidth={1.5}
          />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-text-muted">
        <span>{formatDate(series[0]?.at)}</span>
        <span>{formatDate(last?.at)}</span>
      </div>
    </div>
  );
}
