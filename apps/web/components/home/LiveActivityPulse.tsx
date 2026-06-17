'use client';

// =============================================================================
// HSI Phase 43 — live activity console line. Cycles through REAL public-safe
// platform events (passed from the server) one at a time, Bloomberg / ops-console
// style — NOT a social feed. Reduced motion → a static first line, no cycling.
// SSR-stable (always starts at index 0) → no hydration drift. When there are no
// public events yet, it shows a calm idle state (never fabricated events).
// =============================================================================

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { PublicActivityItem, PublicActivityKind } from '@/lib/public-intelligence';

const KIND_COLOR: Record<PublicActivityKind, string> = {
  'NEW SIGNAL': '#3B82F6',
  'EVIDENCE LINKED': '#10B981',
  'REVIEW COMPLETED': '#F59E0B',
  'REPORT PUBLISHED': '#8B5CF6',
  'SOURCE VERIFIED': '#06B6D4',
};

export function LiveActivityPulse({ items }: { items: PublicActivityItem[] }) {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const has = items.length > 0;

  useEffect(() => {
    if (reduce || items.length <= 1) return;
    const id = setInterval(() => setI((n) => (n + 1) % items.length), 3000);
    return () => clearInterval(id);
  }, [reduce, items.length]);

  if (!has) {
    return (
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full bg-text-muted" />
          <span className="truncate text-caption text-text-muted">Monitoring public signals…</span>
        </div>
        <span className="shrink-0 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-text-muted">live · ops</span>
      </div>
    );
  }

  const e = items[i % items.length];
  const color = KIND_COLOR[e.kind] ?? '#3B82F6';

  return (
    <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="relative flex h-2 w-2 shrink-0">
          {!reduce ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ backgroundColor: color }} /> : null}
          <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        </span>
        {reduce ? (
          <ActivityLine e={e} color={color} />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={e.id}
              className="flex min-w-0 items-center gap-2"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            >
              <ActivityLine e={e} color={color} />
            </motion.div>
          </AnimatePresence>
        )}
      </div>
      <span className="shrink-0 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-text-muted">live · ops</span>
    </div>
  );
}

function ActivityLine({ e, color }: { e: PublicActivityItem; color: string }) {
  return (
    <>
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide" style={{ color }}>{e.kind}</span>
      <span className="truncate text-caption text-text-secondary">{e.text}</span>
    </>
  );
}
