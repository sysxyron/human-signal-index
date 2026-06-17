'use client';

// =============================================================================
// HSI Phase 42.2 — "Latest Public Signals" horizontal ticker. A continuous,
// restrained marquee of recent public intelligence events (real when available,
// else seeded demo). Reduced motion → a static, scrollable row (no animation).
// =============================================================================

import { motion, useReducedMotion } from 'framer-motion';
import { Radio } from 'lucide-react';
import type { FeedItem } from './LiveSignalsFeed';

const RISK_COLOR: Record<number, string> = { 1: '#10B981', 2: '#3B82F6', 3: '#F59E0B', 4: '#EF4444', 5: '#B91C1C' };

function Chip({ it }: { it: FeedItem }) {
  const dot = it.risk ? RISK_COLOR[it.risk] : '#10B981';
  return (
    <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1.5 text-caption">
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dot }} />
      <span className="font-medium text-text-primary">{it.title}</span>
      <span className="text-text-muted">· {it.category}</span>
      <span className="text-text-muted">· {it.time}</span>
    </span>
  );
}

export function SignalTicker({ items }: { items: FeedItem[] }) {
  const reduce = useReducedMotion();
  if (items.length === 0) return null;

  return (
    <div className="rounded-card border border-border bg-surface/40 p-2.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <span className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full bg-electric/15 px-2.5 py-1 text-label font-semibold uppercase tracking-wide text-electric">
          <Radio className="h-3.5 w-3.5" /> Latest Public Signals
        </span>
        <div className="relative min-w-0 flex-1 overflow-hidden">
          {reduce ? (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {items.map((it, i) => <Chip key={i} it={it} />)}
            </div>
          ) : (
            <motion.div
              className="flex gap-3"
              animate={{ x: ['0%', '-50%'] }}
              transition={{ duration: Math.max(24, items.length * 6), repeat: Infinity, ease: 'linear' }}
            >
              {[...items, ...items].map((it, i) => <Chip key={i} it={it} />)}
            </motion.div>
          )}
          {/* edge fades */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent" />
        </div>
      </div>
    </div>
  );
}
