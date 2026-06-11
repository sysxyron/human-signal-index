// =============================================================================
// HSI Phase 16 — ReliabilityDiagram. The centrepiece calibration chart: pure,
// deterministic SVG plotting PREDICTED confidence (x-axis) against OBSERVED
// success (y-axis), with the diagonal "perfect calibration" reference line and
// one point per populated confidence bin (point AREA ∝ observation count). A point
// ON the diagonal means that confidence band succeeded exactly as often as it
// claimed; ABOVE = underconfident, BELOW = overconfident.
//
// EXPLAINABLE — axes are labelled, tick values are shown, and a legend states
// what the diagonal + point size mean. No black box. Server-safe.
// =============================================================================

import { Card } from '@hsi/ui';
import { GitCompareArrows, Info } from 'lucide-react';
import { formatErrorPct, toneColor, type DiagramBin } from '@/lib/calibration/view';

export function ReliabilityDiagram({
  bins,
  ece,
  mce,
  title = 'Reliability diagram',
}: {
  bins: DiagramBin[];
  ece?: number | null;
  mce?: number | null;
  title?: string;
}) {
  // Geometry — a square plot with padding for the axes/labels.
  const size = 320;
  const padL = 44;
  const padB = 36;
  const padT = 12;
  const padR = 12;
  const plotW = size - padL - padR;
  const plotH = size - padT - padB;

  const x = (v: number) => padL + Math.max(0, Math.min(1, v)) * plotW;
  const y = (v: number) => padT + (1 - Math.max(0, Math.min(1, v))) * plotH;

  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const populated = bins.filter((b) => b.count > 0);
  const maxCount = Math.max(1, ...populated.map((b) => b.count));
  // Point radius scales with sqrt(count) so AREA ∝ count (honest visual weight).
  const radius = (count: number) => 4 + 9 * Math.sqrt(count / maxCount);

  return (
    <Card className="space-y-3" padded>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <GitCompareArrows className="h-4 w-4 text-electric" /> {title}
        </h3>
        <div className="flex items-center gap-3 text-caption">
          {ece != null ? (
            <span className="text-text-muted">
              ECE <span className="font-semibold text-text-primary">{formatErrorPct(ece)}</span>
            </span>
          ) : null}
          {mce != null ? (
            <span className="text-text-muted">
              MCE <span className="font-semibold text-text-primary">{formatErrorPct(mce)}</span>
            </span>
          ) : null}
        </div>
      </div>

      <p className="flex items-start gap-2 text-caption leading-relaxed text-text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-electric" />
        Each point is one confidence band: x = predicted confidence, y = observed
        success rate. Point area is proportional to the number of observations. The
        dashed diagonal is PERFECT calibration — points above it are underconfident,
        below it are overconfident.
      </p>

      {populated.length === 0 ? (
        <p className="py-8 text-center text-caption text-text-muted">
          No populated confidence bins yet — calibration cannot be plotted.
        </p>
      ) : (
        <div className="flex justify-center">
          <svg
            viewBox={`0 0 ${size} ${size}`}
            width="100%"
            height={size}
            style={{ maxWidth: size }}
            role="img"
            aria-label="Reliability diagram: predicted confidence vs observed success"
          >
            {/* Grid + ticks */}
            {ticks.map((t) => (
              <g key={`g-${t}`}>
                <line
                  x1={x(t)}
                  x2={x(t)}
                  y1={padT}
                  y2={padT + plotH}
                  stroke="#1F2A44"
                  strokeWidth={1}
                  strokeDasharray="2 4"
                />
                <line
                  x1={padL}
                  x2={padL + plotW}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="#1F2A44"
                  strokeWidth={1}
                  strokeDasharray="2 4"
                />
                {/* x tick label */}
                <text
                  x={x(t)}
                  y={size - padB + 16}
                  fill="#94A3B8"
                  fontSize={10}
                  textAnchor="middle"
                >
                  {Math.round(t * 100)}%
                </text>
                {/* y tick label */}
                <text
                  x={padL - 8}
                  y={y(t) + 3}
                  fill="#94A3B8"
                  fontSize={10}
                  textAnchor="end"
                >
                  {Math.round(t * 100)}%
                </text>
              </g>
            ))}

            {/* Axis frame */}
            <rect
              x={padL}
              y={padT}
              width={plotW}
              height={plotH}
              fill="none"
              stroke="#2A3A5C"
              strokeWidth={1}
            />

            {/* Perfect-calibration diagonal */}
            <line
              x1={x(0)}
              y1={y(0)}
              x2={x(1)}
              y2={y(1)}
              stroke={toneColor('green')}
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />

            {/* Connecting line between observed points (left→right). */}
            {populated.length > 1 ? (
              <polyline
                points={populated
                  .map((b) => `${x(b.meanConfidence)},${y(b.observedSuccess)}`)
                  .join(' ')}
                fill="none"
                stroke={toneColor('blue')}
                strokeWidth={1.5}
                strokeLinejoin="round"
                opacity={0.7}
              />
            ) : null}

            {/* Bin points (area ∝ count). Color = error magnitude. */}
            {populated.map((b) => {
              const err = b.calibrationError;
              const color =
                err <= 0.05
                  ? toneColor('green')
                  : err <= 0.15
                    ? toneColor('orange')
                    : toneColor('red');
              return (
                <g key={b.label}>
                  <circle
                    cx={x(b.meanConfidence)}
                    cy={y(b.observedSuccess)}
                    r={radius(b.count)}
                    fill={`${color}40`}
                    stroke={color}
                    strokeWidth={1.5}
                  />
                  <title>
                    {b.label}: predicted {Math.round(b.meanConfidence * 100)}%, observed{' '}
                    {Math.round(b.observedSuccess * 100)}% · n={b.count} · error{' '}
                    {formatErrorPct(err)}
                  </title>
                </g>
              );
            })}

            {/* Axis titles */}
            <text
              x={padL + plotW / 2}
              y={size - 2}
              fill="#CBD5E1"
              fontSize={11}
              fontWeight={600}
              textAnchor="middle"
            >
              Predicted confidence
            </text>
            <text
              x={12}
              y={padT + plotH / 2}
              fill="#CBD5E1"
              fontSize={11}
              fontWeight={600}
              textAnchor="middle"
              transform={`rotate(-90 12 ${padT + plotH / 2})`}
            >
              Observed success
            </text>
          </svg>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 text-caption text-text-muted">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-0 w-5 border-t-2 border-dashed"
            style={{ borderColor: toneColor('green') }}
          />
          Perfect calibration
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: `${toneColor('green')}40`, border: `1.5px solid ${toneColor('green')}` }}
          />
          ≤5% error
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: `${toneColor('orange')}40`, border: `1.5px solid ${toneColor('orange')}` }}
          />
          ≤15% error
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: `${toneColor('red')}40`, border: `1.5px solid ${toneColor('red')}` }}
          />
          &gt;15% error
        </span>
        <span className="ml-auto">point area ∝ observations</span>
      </div>
    </Card>
  );
}
