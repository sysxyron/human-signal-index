'use client';

// =============================================================================
// HSI Phase 42.3 — live activity console line. A single, restrained operations
// status that cycles through recent platform events (Bloomberg / ops console,
// NOT a social feed). One line at a time, gentle cross-fade. Reduced motion →
// a static first line, no cycling. Deterministic order, SSR-stable (always
// starts at index 0) → no hydration drift.
// =============================================================================

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

const EVENTS = [
  { label: 'New signal detected', color: '#3B82F6' },
  { label: 'Evidence linked', color: '#10B981' },
  { label: 'Review completed', color: '#F59E0B' },
  { label: 'Source verified', color: '#8B5CF6' },
] as const;

export function LiveActivityPulse() {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setI((n) => (n + 1) % EVENTS.length), 2800);
    return () => clearInterval(id);
  }, [reduce]);

  const e = EVENTS[i];

  return (
    <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="relative flex h-2 w-2 shrink-0">
          {!reduce ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ backgroundColor: e.color }} /> : null}
          <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: e.color }} />
        </span>
        {reduce ? (
          <span className="truncate text-caption text-text-secondary">{e.label}</span>
        ) : (
          <AnimatePresence mode="wait">
            <motion.span
              key={i}
              className="truncate text-caption text-text-secondary"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            >
              {e.label}
            </motion.span>
          </AnimatePresence>
        )}
      </div>
      <span className="shrink-0 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-text-muted">live · ops</span>
    </div>
  );
}
