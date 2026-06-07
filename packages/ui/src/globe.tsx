import { cn } from './utils';

/* -------------------------------------------------------------------------- */
/* GlobeHero — pure SVG/CSS glowing network globe                               */
/* Concentric rings + meridians + glowing nodes + arc connections.             */
/* -------------------------------------------------------------------------- */

const nodes = [
  { x: 130, y: 90 },
  { x: 250, y: 70 },
  { x: 320, y: 150 },
  { x: 90, y: 200 },
  { x: 200, y: 230 },
  { x: 300, y: 260 },
  { x: 160, y: 300 },
  { x: 260, y: 320 },
  { x: 360, y: 220 },
  { x: 120, y: 130 },
];

const arcs: [number, number][] = [
  [0, 1],
  [1, 2],
  [0, 3],
  [3, 4],
  [4, 5],
  [4, 6],
  [6, 7],
  [2, 8],
  [5, 8],
  [9, 0],
  [1, 4],
  [7, 5],
];

export function GlobeHero({ className = '' }: { className?: string }) {
  const cx = 220;
  const cy = 210;
  const r = 180;
  return (
    <div className={cn('relative', className)} aria-hidden>
      {/* ambient glow */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60 blur-3xl"
          style={{
            background:
              'radial-gradient(circle, rgba(37,99,235,0.45) 0%, rgba(139,92,246,0.18) 45%, transparent 70%)',
          }}
        />
      </div>

      <svg
        viewBox="0 0 440 420"
        className="w-full max-w-[460px]"
        role="img"
        aria-label="Global signal network"
      >
        <defs>
          <radialGradient id="globe-sphere" cx="38%" cy="32%" r="75%">
            <stop offset="0%" stopColor="#16294f" />
            <stop offset="55%" stopColor="#0a1530" />
            <stop offset="100%" stopColor="#04070f" />
          </radialGradient>
          <linearGradient id="globe-arc" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
          <filter id="globe-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        </defs>

        {/* sphere */}
        <circle cx={cx} cy={cy} r={r} fill="url(#globe-sphere)" />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="#2563EB"
          strokeOpacity={0.35}
          strokeWidth={1}
        />

        {/* latitude rings */}
        {[0.32, 0.62, 0.86].map((f, i) => (
          <ellipse
            key={`lat-${i}`}
            cx={cx}
            cy={cy}
            rx={r}
            ry={r * f}
            fill="none"
            stroke="#3B82F6"
            strokeOpacity={0.14}
            strokeWidth={1}
          />
        ))}
        {/* longitude meridians */}
        {[0.32, 0.62, 0.86].map((f, i) => (
          <ellipse
            key={`lon-${i}`}
            cx={cx}
            cy={cy}
            rx={r * f}
            ry={r}
            fill="none"
            stroke="#3B82F6"
            strokeOpacity={0.12}
            strokeWidth={1}
          />
        ))}
        <line
          x1={cx}
          y1={cy - r}
          x2={cx}
          y2={cy + r}
          stroke="#3B82F6"
          strokeOpacity={0.12}
        />
        <line
          x1={cx - r}
          y1={cy}
          x2={cx + r}
          y2={cy}
          stroke="#3B82F6"
          strokeOpacity={0.12}
        />

        {/* connection arcs */}
        <g>
          {arcs.map(([a, b], i) => {
            const p1 = nodes[a];
            const p2 = nodes[b];
            const mx = (p1.x + p2.x) / 2;
            const my = (p1.y + p2.y) / 2 - 40;
            return (
              <path
                key={i}
                d={`M${p1.x},${p1.y} Q${mx},${my} ${p2.x},${p2.y}`}
                fill="none"
                stroke="url(#globe-arc)"
                strokeOpacity={0.55}
                strokeWidth={1.2}
              />
            );
          })}
        </g>

        {/* nodes */}
        <g>
          {nodes.map((n, i) => (
            <g key={i}>
              <circle
                cx={n.x}
                cy={n.y}
                r={6}
                fill="#3B82F6"
                opacity={0.25}
                filter="url(#globe-blur)"
              />
              <circle cx={n.x} cy={n.y} r={2.6} fill="#93C5FD">
                <animate
                  attributeName="opacity"
                  values="0.4;1;0.4"
                  dur={`${2.5 + (i % 4) * 0.6}s`}
                  repeatCount="indefinite"
                />
              </circle>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
