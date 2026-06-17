'use client';

// =============================================================================
// HSI Phase 42.3 — world-scale intelligence globe hero (final polish).
//
// A dark wireframe globe (latitudes + meridians) under a slow, restrained
// rotation, layered for depth: a distant background node field, the rotating
// network cage (categorized nodes + connection lines + travelling signal
// packets + narrative hotspots), an atmospheric halo + fog, a central
// "processing nucleus" (intelligence core that emits/syncs signal packets), and
// bright foreground nodes on top. A few floating HUD cards sit outside the SVG.
//
// Pure SVG + framer-motion (no WebGL/canvas). Decorative (aria-hidden) and fully
// reduced-motion aware: under reduced motion all rotation/packets/pulses freeze
// while every layer (and the layout) is preserved.
//
// Aesthetic: intelligence operations center (Palantir / Recorded Future), not
// crypto/gaming/neon.
// =============================================================================

import { motion, useReducedMotion } from 'framer-motion';
import { distributeNodes, colorForBucket, type CategoryActivity } from '@/lib/public-intelligence-mapping';

const C = 240;
const R = 185;

// Node categories.
const CATS = [
  { color: '#3B82F6', label: 'Verified' },
  { color: '#10B981', label: 'Trusted source' },
  { color: '#F59E0B', label: 'Under review' },
  { color: '#EF4444', label: 'High risk' },
  { color: '#8B5CF6', label: 'Influence activity' },
] as const;

function pt(angleDeg: number, frac: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: C + Math.cos(a) * R * frac, y: C + Math.sin(a) * R * frac };
}

// Midground node ring (deterministic — no Math.random → no hydration drift).
const NODES = Array.from({ length: 14 }, (_, i) => {
  const angle = i * (360 / 14) + (i % 2 ? 11 : -7);
  const frac = [0.58, 0.82, 1.0, 0.71][i % 4];
  return { ...pt(angle, frac), cat: i % CATS.length };
});

// Distant background node field — dim, small, blurred, static (parallax depth).
const BG_NODES = Array.from({ length: 16 }, (_, i) => {
  const angle = i * (360 / 16) + (i % 3 ? 21 : -15);
  const frac = [0.5, 0.9, 0.68, 0.86, 0.78, 0.62][i % 6];
  return { ...pt(angle, frac), cat: (i * 2) % CATS.length };
});

// Foreground nodes — bright, larger, on top of everything (near depth).
const FG_NODES = [
  { ...pt(38, 0.46), cat: 3 },
  { ...pt(148, 0.55), cat: 4 },
  { ...pt(256, 0.4), cat: 0 },
  { ...pt(312, 0.62), cat: 1 },
];

// A small, intentional set of connections + travelling packets + hotspots.
const CONNS: Array<[number, number]> = [0, 2, 4, 6, 8, 10, 12].map((i) => [i, (i + 3) % NODES.length]);
const PACKETS = CONNS.slice(0, 5);
const HOTSPOTS = [1, 6, 11];
// Nodes the central processing core links to / emits packets toward.
const CORE_LINKS = [1, 5, 8, 12];

// Latitude rings (static within the rotating cage).
const LATS = [-130, -70, 0, 70, 130].map((dy) => {
  const rx = Math.sqrt(Math.max(0, R * R - dy * dy));
  return { cy: C + dy, rx, ry: rx * 0.18 };
});
// Meridian ellipses at stepped longitudes.
const MERIDIANS = [R, R * 0.66, R * 0.34, 3];

export function HeroNetworkGlobe({ className, categoryActivity }: { className?: string; categoryActivity?: CategoryActivity[] }) {
  const reduce = useReducedMotion();

  // When real narrative activity exists, color the network nodes by category
  // frequency (the globe becomes a live visualization, not decoration). Falls
  // back to the static category palette when there is no public activity.
  const live = (categoryActivity ?? []).some((a) => a.count > 0)
    ? distributeNodes(NODES.length, categoryActivity ?? [])
    : null;
  const nodeColor = (i: number) => (live ? colorForBucket(live[i % live.length]) : CATS[NODES[i].cat].color);

  return (
    <div className={`relative ${className ?? ''}`}>
      <svg
        viewBox="0 0 480 480"
        className="h-auto w-full max-w-[620px] overflow-visible transition-transform lg:max-w-none lg:scale-[1.26] xl:scale-[1.32]"
        aria-hidden
      >
        <defs>
          <radialGradient id="hsi-globe-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.24" />
            <stop offset="55%" stopColor="#8B5CF6" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
          </radialGradient>
          {/* atmospheric rim halo */}
          <radialGradient id="hsi-atmosphere" cx="50%" cy="50%" r="50%">
            <stop offset="62%" stopColor="#3B82F6" stopOpacity="0" />
            <stop offset="88%" stopColor="#60a5fa" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="hsi-globe-shade" cx="38%" cy="34%" r="75%">
            <stop offset="0%" stopColor="#0a1326" stopOpacity="0.0" />
            <stop offset="100%" stopColor="#02040a" stopOpacity="0.55" />
          </radialGradient>
          {/* depth / fog overlay (haze toward the lower front) */}
          <radialGradient id="hsi-fog" cx="50%" cy="64%" r="58%">
            <stop offset="0%" stopColor="#060b18" stopOpacity="0" />
            <stop offset="100%" stopColor="#050912" stopOpacity="0.5" />
          </radialGradient>
          {/* restrained connection gradient (stronger than flat lines) */}
          <linearGradient id="hsi-conn" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3f5e93" />
            <stop offset="100%" stopColor="#27375a" />
          </linearGradient>
          <filter id="hsi-globe-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
          <filter id="hsi-bg-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.6" />
          </filter>
          {/* central processing core */}
          <radialGradient id="hsi-core-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#bfdbfe" stopOpacity="0.6" />
            <stop offset="40%" stopColor="#60a5fa" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="hsi-core-nucleus" cx="42%" cy="38%" r="65%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#93c5fd" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.85" />
          </radialGradient>
        </defs>

        {/* ambient glow + atmosphere */}
        <circle cx={C} cy={C} r={R + 34} fill="url(#hsi-globe-glow)" />
        <circle cx={C} cy={C} r={R + 10} fill="url(#hsi-atmosphere)" />

        {/* distant background node field (static → parallax depth) */}
        <g filter="url(#hsi-bg-blur)" opacity={0.5}>
          {BG_NODES.map((n, i) => (
            <circle key={`bg${i}`} cx={n.x} cy={n.y} r={1.8} fill={CATS[n.cat].color} opacity={0.5} />
          ))}
        </g>

        {/* rotating wireframe cage + network layer */}
        <motion.g
          style={{ originX: `${C}px`, originY: `${C}px` }}
          animate={reduce ? undefined : { rotate: 360 }}
          transition={reduce ? undefined : { duration: 80, repeat: Infinity, ease: 'linear' }}
        >
          <circle cx={C} cy={C} r={R} fill="none" stroke="#243352" strokeWidth={1.1} />
          {LATS.map((l, i) => (
            <ellipse key={`lat${i}`} cx={C} cy={l.cy} rx={l.rx} ry={l.ry} fill="none" stroke="#1f2a44" strokeWidth={1} />
          ))}
          {MERIDIANS.map((rx, i) => (
            <ellipse key={`mer${i}`} cx={C} cy={C} rx={rx} ry={R} fill="none" stroke="#1f2a44" strokeWidth={1} />
          ))}

          {/* connections — restrained but stronger (gradient stroke) */}
          <g stroke="url(#hsi-conn)" strokeWidth={1.2} opacity={0.85}>
            {CONNS.map(([a, b], i) => (
              <line key={`c${i}`} x1={NODES[a].x} y1={NODES[a].y} x2={NODES[b].x} y2={NODES[b].y} />
            ))}
          </g>

          {/* core links — the network synced to the central processing core */}
          <g stroke="#2f4a78" strokeWidth={0.8} opacity={0.45}>
            {CORE_LINKS.map((n) => (
              <line key={`cl${n}`} x1={C} y1={C} x2={NODES[n].x} y2={NODES[n].y} />
            ))}
          </g>

          {/* packets emitted from the core, syncing outward to the network */}
          {!reduce
            ? CORE_LINKS.map((n, i) => (
                <motion.circle
                  key={`cp${i}`}
                  r={2}
                  fill="#93c5fd"
                  initial={{ cx: C, cy: C, opacity: 0 }}
                  animate={{ cx: [C, NODES[n].x], cy: [C, NODES[n].y], opacity: [0, 0.9, 0] }}
                  transition={{ duration: 2.8, repeat: Infinity, delay: i * 0.9, ease: 'easeIn' }}
                />
              ))
            : null}

          {/* travelling signal packets */}
          {!reduce
            ? PACKETS.map(([a, b], i) => (
                <motion.circle
                  key={`pk${i}`}
                  r={2.6}
                  fill="#60a5fa"
                  initial={{ cx: NODES[a].x, cy: NODES[a].y, opacity: 0 }}
                  animate={{ cx: [NODES[a].x, NODES[b].x], cy: [NODES[a].y, NODES[b].y], opacity: [0, 1, 0] }}
                  transition={{ duration: 2.6, repeat: Infinity, delay: 0.7 + i * 0.6, ease: 'easeInOut' }}
                />
              ))
            : null}

          {/* narrative hotspots */}
          {!reduce
            ? HOTSPOTS.map((n, i) => (
                <motion.circle
                  key={`h${i}`}
                  cx={NODES[n].x}
                  cy={NODES[n].y}
                  fill="none"
                  stroke={nodeColor(n)}
                  strokeWidth={1.4}
                  initial={{ r: 2, opacity: 0 }}
                  animate={{ r: [2, 34], opacity: [0.55, 0] }}
                  transition={{ duration: 3.2, repeat: Infinity, delay: 1 + i * 1.7, ease: 'easeOut' }}
                />
              ))
            : null}

          {/* midground nodes */}
          {NODES.map((n, i) => {
            const color = nodeColor(i);
            return (
              <g key={`n${i}`}>
                <circle cx={n.x} cy={n.y} r={7} fill={color} opacity={0.18} filter="url(#hsi-globe-blur)" />
                <circle cx={n.x} cy={n.y} r={3.4} fill={color} />
                {!reduce ? (
                  <motion.circle
                    cx={n.x} cy={n.y} fill="none" stroke={color} strokeWidth={1}
                    initial={{ r: 3.4, opacity: 0.5 }}
                    animate={{ r: [3.4, 9], opacity: [0.5, 0] }}
                    transition={{ duration: 2.8, repeat: Infinity, delay: (i % 7) * 0.4, ease: 'easeOut' }}
                  />
                ) : null}
              </g>
            );
          })}
        </motion.g>

        {/* spherical shading (fixed light, on top of the spinning cage) */}
        <circle cx={C} cy={C} r={R} fill="url(#hsi-globe-shade)" pointerEvents="none" />
        {/* depth / fog haze */}
        <circle cx={C} cy={C} r={R} fill="url(#hsi-fog)" pointerEvents="none" />

        {/* central processing core — luminous, stable centre (does not spin with the cage) */}
        <g>
          <circle cx={C} cy={C} r={36} fill="url(#hsi-core-glow)" />
          {/* slow scanner ring — reads as "processing", not a science-class atom */}
          {!reduce ? (
            <motion.circle
              cx={C} cy={C} r={15} fill="none" stroke="#60a5fa" strokeWidth={0.8} strokeDasharray="3 6" opacity={0.45}
              style={{ originX: `${C}px`, originY: `${C}px` }}
              animate={{ rotate: 360 }}
              transition={{ duration: 26, repeat: Infinity, ease: 'linear' }}
            />
          ) : (
            <circle cx={C} cy={C} r={15} fill="none" stroke="#60a5fa" strokeWidth={0.8} strokeDasharray="3 6" opacity={0.45} />
          )}
          <Orbit reduce={reduce} tilt={0} duration={16} dir={1} electron="#93c5fd" />
          <Orbit reduce={reduce} tilt={62} duration={20} dir={-1} electron="#c4b5fd" />
          <Orbit reduce={reduce} tilt={120} duration={24} dir={1} electron="#6ee7b7" />
          <circle cx={C} cy={C} r={9} fill="none" stroke="#93c5fd" strokeWidth={0.7} opacity={0.4} />
          <circle cx={C} cy={C} r={6} fill="url(#hsi-core-nucleus)" />
          {!reduce ? (
            <motion.circle
              cx={C} cy={C} fill="none" stroke="#bfdbfe" strokeWidth={1}
              initial={{ r: 6, opacity: 0.5 }}
              animate={{ r: [6, 17], opacity: [0.5, 0] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: 'easeOut' }}
            />
          ) : null}
        </g>

        {/* foreground nodes — bright, on top (near depth) */}
        {FG_NODES.map((n, i) => {
          const color = CATS[n.cat].color;
          return (
            <g key={`fg${i}`}>
              <circle cx={n.x} cy={n.y} r={10} fill={color} opacity={0.22} filter="url(#hsi-globe-blur)" />
              <circle cx={n.x} cy={n.y} r={4.4} fill={color} />
              <circle cx={n.x - 1.2} cy={n.y - 1.2} r={1.4} fill="#ffffff" opacity={0.7} />
              {!reduce && i % 2 === 0 ? (
                <motion.circle
                  cx={n.x} cy={n.y} fill="none" stroke={color} strokeWidth={1.2}
                  initial={{ r: 4.4, opacity: 0.6 }}
                  animate={{ r: [4.4, 13], opacity: [0.6, 0] }}
                  transition={{ duration: 3, repeat: Infinity, delay: i * 0.8, ease: 'easeOut' }}
                />
              ) : null}
            </g>
          );
        })}
      </svg>

      {/* floating HUD cards — readable, outside the rotating SVG (unscaled, stay on-screen). */}
      {/* Mobile shows ≤2 cards (≥390px adds Traceability); the rest appear at sm+. */}
      <HudCard className="left-0 top-6" dot="#10B981" label="Sources today" value="+183" reduce={reduce} delay={0} />
      <HudCard className="bottom-[18%] left-2 hidden min-[390px]:block" dot="#3B82F6" label="Traceability" value="96.3%" reduce={reduce} delay={0.6} />
      <HudCard className="right-0 top-1/4 hidden sm:block" dot="#EF4444" label="Risk alert" value="High-risk cluster" reduce={reduce} delay={1.2} />
      <HudCard className="bottom-3 right-4 hidden sm:block" dot="#8B5CF6" label="Human review" value="Active" reduce={reduce} delay={1.8} />
    </div>
  );
}

// A single processing-core data ring: a tilted dashed ellipse with a small data
// node riding it. Reduced motion → a static tilted ring (no spin).
function Orbit({ reduce, tilt, duration, dir, electron }: { reduce: boolean | null; tilt: number; duration: number; dir: 1 | -1; electron: string }) {
  const rx = 27;
  const ry = 9;
  return (
    <g transform={`rotate(${tilt} ${C} ${C})`}>
      <ellipse cx={C} cy={C} rx={rx} ry={ry} fill="none" stroke="#5b7fb8" strokeWidth={0.7} strokeDasharray="2 5" opacity={0.5} />
      <motion.g
        style={{ originX: `${C}px`, originY: `${C}px` }}
        animate={reduce ? undefined : { rotate: 360 * dir }}
        transition={reduce ? undefined : { duration, repeat: Infinity, ease: 'linear' }}
      >
        <circle cx={C + rx} cy={C} r={1.8} fill={electron} opacity={0.9} />
      </motion.g>
    </g>
  );
}

function HudCard({ className, dot, label, value, reduce, delay }: { className: string; dot: string; label: string; value: string; reduce: boolean | null; delay: number }) {
  return (
    <motion.div
      className={`pointer-events-none absolute ${className} glass-card rounded-card border border-border bg-surface/80 px-3 py-2 shadow-glow`}
      animate={reduce ? undefined : { y: [0, -6, 0] }}
      transition={reduce ? undefined : { duration: 6, repeat: Infinity, ease: 'easeInOut', delay }}
    >
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dot }} />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{label}</span>
      </div>
      <div className="text-caption font-semibold text-text-primary">{value}</div>
    </motion.div>
  );
}
