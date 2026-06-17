'use client';

// =============================================================================
// HSI Phase 42 — animated traceability pipeline:
//   Signal → Evidence → Analysis → Human Review → Publication
// Stages reveal in sequence with glowing connectors. Reinforces HSI's core
// differentiator: every published conclusion is traceable end to end.
// =============================================================================

import { motion, useReducedMotion } from 'framer-motion';
import { Radio, FileSearch, ScanText, UserCheck, Megaphone, type LucideProps } from 'lucide-react';
import { type ComponentType } from 'react';

const STAGES: Array<{ icon: ComponentType<LucideProps>; label: string; note: string; color: string }> = [
  { icon: Radio, label: 'Signal', note: 'Captured from public sources', color: '#3B82F6' },
  { icon: FileSearch, label: 'Evidence', note: 'Gathered, hashed, archived', color: '#8B5CF6' },
  { icon: ScanText, label: 'Analysis', note: 'Classified + risk-scored', color: '#F59E0B' },
  { icon: UserCheck, label: 'Human Review', note: 'A person decides', color: '#10B981' },
  { icon: Megaphone, label: 'Publication', note: 'Traceable + correctable', color: '#3B82F6' },
];

export function TraceabilityPipeline() {
  const reduce = useReducedMotion();
  return (
    <div className="grid items-stretch gap-3 md:grid-cols-9">
      {STAGES.map((s, i) => {
        const Icon = s.icon;
        return (
          <div key={s.label} className="contents">
            <motion.div
              className="md:col-span-1 flex flex-col items-center gap-2 rounded-card border border-border bg-surface/60 p-4 text-center"
              style={{ gridColumn: 'span 1' }}
              initial={reduce ? undefined : { opacity: 0, y: 14 }}
              whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={reduce ? undefined : { duration: 0.45, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${s.color}1f`, color: s.color, boxShadow: `0 0 18px ${s.color}33` }}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-body-sm font-semibold text-text-primary">{s.label}</span>
              <span className="text-caption text-text-muted">{s.note}</span>
            </motion.div>
            {i < STAGES.length - 1 ? (
              <div className="hidden items-center justify-center md:flex">
                <motion.span
                  className="h-px w-full"
                  style={{ background: 'linear-gradient(90deg, #2a3a5c, #3B82F6)' }}
                  initial={reduce ? undefined : { scaleX: 0, opacity: 0 }}
                  whileInView={reduce ? undefined : { scaleX: 1, opacity: 1 }}
                  viewport={{ once: true }}
                  transition={reduce ? undefined : { duration: 0.4, delay: i * 0.12 + 0.2 }}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
