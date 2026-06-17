'use client';

// =============================================================================
// HSI Phase 42 — hero "signal network" intelligence visualization.
//
// A deterministic node-link graph (central hub + two rings) with glowing nodes,
// links that draw in, and signal "pulses" travelling along the edges — an
// operations-room feel (Palantir/Anduril), not a generic SaaS sphere. Fully
// decorative (aria-hidden) and deterministic (no Math.random at render, so no
// hydration mismatch). Animation pauses entirely under reduced motion.
// =============================================================================

import { motion, useReducedMotion } from 'framer-motion';

const CX = 220;
const CY = 210;

interface Node { x: number; y: number; r: number; ring: 0 | 1 | 2 }

function ring(count: number, radius: number, ringId: 1 | 2, phase: number): Node[] {
  return Array.from({ length: count }, (_, i) => {
    const a = phase + (i / count) * Math.PI * 2;
    return { x: CX + Math.cos(a) * radius, y: CY + Math.sin(a) * radius, r: ringId === 1 ? 6 : 4.5, ring: ringId };
  });
}

const HUB: Node = { x: CX, y: CY, r: 11, ring: 0 };
const RING1 = ring(6, 112, 1, -Math.PI / 2);
const RING2 = ring(10, 188, 2, 0.2);
const NODES = [HUB, ...RING1, ...RING2];

// Links: hub → each ring-1 node, and each ring-1 node → its two nearest ring-2 nodes.
const LINKS: Array<{ a: Node; b: Node }> = [
  ...RING1.map((n) => ({ a: HUB, b: n })),
  ...RING1.flatMap((n, i) => [RING2[(i * 2) % RING2.length], RING2[(i * 2 + 1) % RING2.length]].map((b) => ({ a: n, b }))),
];

// A representative subset of links carry travelling signal pulses.
const PULSES = LINKS.filter((_, i) => i % 3 === 0).slice(0, 7);

export function SignalNetwork({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  return (
    <div className={className} aria-hidden>
      <svg viewBox="0 0 440 420" className="h-auto w-full max-w-[560px] overflow-visible">
        <defs>
          <radialGradient id="hsi-net-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.28" />
            <stop offset="60%" stopColor="#8B5CF6" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
          </radialGradient>
          <filter id="hsi-net-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        </defs>

        {/* ambient glow */}
        <circle cx={CX} cy={CY} r={200} fill="url(#hsi-net-glow)" />

        {/* slowly rotating scaffold ring */}
        <motion.g
          style={{ originX: `${CX}px`, originY: `${CY}px` }}
          animate={reduce ? undefined : { rotate: 360 }}
          transition={reduce ? undefined : { duration: 90, repeat: Infinity, ease: 'linear' }}
        >
          <circle cx={CX} cy={CY} r={188} fill="none" stroke="#1f2a44" strokeWidth={1} strokeDasharray="2 6" />
          <circle cx={CX} cy={CY} r={112} fill="none" stroke="#1f2a44" strokeWidth={1} strokeDasharray="2 8" />
        </motion.g>

        {/* links */}
        <g stroke="#2a3a5c" strokeWidth={1}>
          {LINKS.map((l, i) => (
            <motion.line
              key={i}
              x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y}
              initial={reduce ? undefined : { pathLength: 0, opacity: 0 }}
              whileInView={reduce ? undefined : { pathLength: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={reduce ? undefined : { duration: 0.9, delay: 0.2 + (i % 8) * 0.05, ease: 'easeOut' }}
            />
          ))}
        </g>

        {/* travelling signal pulses */}
        {!reduce
          ? PULSES.map((l, i) => (
              <motion.circle
                key={`p${i}`}
                r={2.6}
                fill="#3B82F6"
                initial={{ cx: l.a.x, cy: l.a.y, opacity: 0 }}
                animate={{ cx: [l.a.x, l.b.x], cy: [l.a.y, l.b.y], opacity: [0, 1, 0] }}
                transition={{ duration: 2.4, repeat: Infinity, delay: 0.6 + i * 0.45, ease: 'easeInOut' }}
              />
            ))
          : null}

        {/* nodes */}
        {NODES.map((n, i) => {
          const fill = n.ring === 0 ? '#3B82F6' : n.ring === 1 ? '#8B5CF6' : '#10B981';
          return (
            <g key={`n${i}`}>
              <circle cx={n.x} cy={n.y} r={n.r + 4} fill={fill} opacity={0.18} filter="url(#hsi-net-blur)" />
              <motion.circle
                cx={n.x} cy={n.y} r={n.r} fill={fill}
                initial={reduce ? undefined : { scale: 0.6, opacity: 0 }}
                whileInView={reduce ? undefined : { scale: 1, opacity: 1 }}
                viewport={{ once: true }}
                transition={reduce ? undefined : { duration: 0.4, delay: 0.1 + (i % 9) * 0.04 }}
                style={{ originX: `${n.x}px`, originY: `${n.y}px` }}
              />
              {!reduce ? (
                <motion.circle
                  cx={n.x} cy={n.y} r={n.r} fill="none" stroke={fill} strokeWidth={1}
                  animate={{ r: [n.r, n.r + 8], opacity: [0.5, 0] }}
                  transition={{ duration: 2.6, repeat: Infinity, delay: (i % 6) * 0.4, ease: 'easeOut' }}
                />
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
