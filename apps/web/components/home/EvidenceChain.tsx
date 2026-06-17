'use client';

// =============================================================================
// HSI Phase 42.2B — "Evidence chain" mini-diagram. A compact, intelligence-grade
// traceability flow (Signal → Source → Analysis → Review → Published) shown under
// the "Why It Matters" CTA so the right column reads as an intentional panel
// rather than dead space. A single restrained pulse travels the chain; reduced
// motion freezes it to a static, legible diagram.
// =============================================================================

import { motion, useReducedMotion } from 'framer-motion';
import { Radio, Link2, ScanText, Users, BadgeCheck } from 'lucide-react';

const STAGES = [
  { icon: Radio, label: 'Signal', color: '#3B82F6' },
  { icon: Link2, label: 'Evidence', color: '#10B981' },
  { icon: ScanText, label: 'Analysis', color: '#8B5CF6' },
  { icon: Users, label: 'Human Review', color: '#F59E0B' },
  { icon: BadgeCheck, label: 'Publication', color: '#10B981' },
] as const;

export function EvidenceChain() {
  const reduce = useReducedMotion();
  return (
    <div className="rounded-card border border-border bg-background-deep/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-label uppercase tracking-wide text-text-muted">Evidence chain</span>
        <span className="text-[10px] font-medium text-text-muted">end to end</span>
      </div>
      <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
        {STAGES.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="flex shrink-0 items-center gap-1">
              <div className="flex flex-col items-center gap-1">
                <span
                  className="relative flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${s.color}1f`, color: s.color }}
                >
                  <Icon className="h-4 w-4" />
                  {!reduce ? (
                    <motion.span
                      className="absolute inset-0 rounded-lg"
                      style={{ boxShadow: `0 0 0 1px ${s.color}` }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0, 0.7, 0] }}
                      transition={{ duration: 3.5, repeat: Infinity, delay: i * 0.7, ease: 'easeInOut' }}
                    />
                  ) : null}
                </span>
                <span className="whitespace-nowrap text-[10px] font-medium text-text-secondary">{s.label}</span>
              </div>
              {i < STAGES.length - 1 ? (
                <div className="relative h-px w-5 shrink-0 self-start mt-4 bg-border">
                  {!reduce ? (
                    <motion.span
                      className="absolute top-1/2 h-1 w-1 -translate-y-1/2 rounded-full bg-electric"
                      initial={{ left: '0%', opacity: 0 }}
                      animate={{ left: ['0%', '100%'], opacity: [0, 1, 0] }}
                      transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.45, ease: 'easeInOut' }}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
