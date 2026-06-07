import { type ReactNode } from 'react';
import { cn } from './utils';

/* -------------------------------------------------------------------------- */
/* Sparkline                                                                    */
/* -------------------------------------------------------------------------- */

export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
  className?: string;
  strokeWidth?: number;
}

function buildPath(data: number[], width: number, height: number, pad = 2) {
  if (data.length === 0) return { line: '', area: '' };
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = (width - pad * 2) / (data.length - 1 || 1);
  const points = data.map((d, i) => {
    const x = pad + i * stepX;
    const y = pad + (height - pad * 2) * (1 - (d - min) / range);
    return [x, y] as const;
  });
  const line = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ');
  const last = points[points.length - 1];
  const first = points[0];
  const area = `${line} L${last[0].toFixed(2)},${height} L${first[0].toFixed(2)},${height} Z`;
  return { line, area };
}

export function Sparkline({
  data,
  width = 120,
  height = 36,
  color = '#3B82F6',
  fill = true,
  className = '',
  strokeWidth = 2,
}: SparklineProps) {
  const { line, area } = buildPath(data, width, height);
  const gid = `spark-${color.replace('#', '')}-${data.length}`;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      role="img"
      aria-hidden
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {fill ? <path d={area} fill={`url(#${gid})`} /> : null}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* LineChart (multi-series, area-filled)                                        */
/* -------------------------------------------------------------------------- */

export interface LineSeries {
  name: string;
  color: string;
  data: number[];
}

export interface LineChartProps {
  series: LineSeries[];
  height?: number;
  xLabels?: string[];
  className?: string;
  showGrid?: boolean;
  showLegend?: boolean;
}

export function LineChart({
  series,
  height = 240,
  xLabels = [],
  className = '',
  showGrid = true,
  showLegend = true,
}: LineChartProps) {
  const width = 720;
  const padL = 8;
  const padR = 8;
  const padT = 12;
  const padB = 24;
  const all = series.flatMap((s) => s.data);
  const max = Math.max(...all, 1);
  const min = Math.min(...all, 0);
  const range = max - min || 1;
  const count = Math.max(...series.map((s) => s.data.length), 1);
  const stepX = (width - padL - padR) / (count - 1 || 1);
  const innerH = height - padT - padB;

  const toY = (v: number) => padT + innerH * (1 - (v - min) / range);
  const gridLines = 4;

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        role="img"
        aria-label="Trend chart"
      >
        <defs>
          {series.map((s) => (
            <linearGradient
              key={s.name}
              id={`area-${s.name.replace(/\s/g, '')}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>

        {showGrid &&
          Array.from({ length: gridLines + 1 }).map((_, i) => {
            const y = padT + (innerH / gridLines) * i;
            return (
              <line
                key={i}
                x1={padL}
                x2={width - padR}
                y1={y}
                y2={y}
                stroke="#1F2A44"
                strokeWidth={1}
                strokeDasharray="2 4"
              />
            );
          })}

        {series.map((s) => {
          const pts = s.data.map(
            (d, i) => [padL + i * stepX, toY(d)] as const,
          );
          const line = pts
            .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
            .join(' ');
          const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${height - padB} L${pts[0][0].toFixed(1)},${height - padB} Z`;
          return (
            <g key={s.name}>
              <path d={area} fill={`url(#area-${s.name.replace(/\s/g, '')})`} />
              <path
                d={line}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {pts.map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r={2.4} fill={s.color} />
              ))}
            </g>
          );
        })}
      </svg>

      {(xLabels.length > 0 || showLegend) && (
        <div className="mt-2 flex items-center justify-between">
          <div className="flex gap-3 text-caption text-text-muted">
            {xLabels.map((l) => (
              <span key={l}>{l}</span>
            ))}
          </div>
          {showLegend ? (
            <div className="flex gap-4">
              {series.map((s) => (
                <span
                  key={s.name}
                  className="flex items-center gap-1.5 text-caption text-text-secondary"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  {s.name}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* DonutChart                                                                    */
/* -------------------------------------------------------------------------- */

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

export interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerLabel?: ReactNode;
  centerValue?: ReactNode;
  className?: string;
}

export function DonutChart({
  segments,
  size = 160,
  thickness = 18,
  centerLabel,
  centerValue,
  className = '',
}: DonutChartProps) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className={cn('flex items-center gap-5', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#162033"
            strokeWidth={thickness}
          />
          {segments.map((s) => {
            const frac = s.value / total;
            const dash = frac * circumference;
            const el = (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                strokeLinecap="round"
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            );
            offset += dash;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {centerValue ? (
            <span className="text-2xl font-bold text-text-primary">{centerValue}</span>
          ) : null}
          {centerLabel ? (
            <span className="text-caption text-text-muted">{centerLabel}</span>
          ) : null}
        </div>
      </div>
      <div className="space-y-2">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-body-sm">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-text-secondary">{s.label}</span>
            <span className="ml-auto font-semibold text-text-primary">
              {Math.round((s.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
