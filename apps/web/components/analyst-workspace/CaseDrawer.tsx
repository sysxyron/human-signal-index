'use client';

// =============================================================================
// HSI Phase 48 — Analyst Workspace case drawer (on-demand). A focused case view:
// collaboration (public-safe ownership metadata only — NO identities, NO notes,
// NO messaging), traceability facts, and a chronological investigation timeline
// (Signal created → Evidence linked → Analysis → Review → Published). Read-only,
// reduced-motion aware.
// =============================================================================

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { RiskBadge, CategoryTag, TraceabilityBadge } from '@hsi/ui';
import { Radio, Link2, ScanText, Users, BadgeCheck, X, ShieldCheck, UserCheck } from 'lucide-react';
import { toneForBucket } from '@/lib/public-intelligence-mapping';
import type { PublicLibrarySignal } from '@/lib/public-intelligence';

const STAGES = [
  { icon: Radio, label: 'Signal created', color: '#3B82F6' },
  { icon: Link2, label: 'Evidence linked', color: '#10B981' },
  { icon: ScanText, label: 'Analysis completed', color: '#8B5CF6' },
  { icon: Users, label: 'Review completed', color: '#F59E0B' },
  { icon: BadgeCheck, label: 'Published', color: '#10B981' },
] as const;

export function CaseDrawer({ item, onClose }: { item: PublicLibrarySignal | null; onClose: () => void }) {
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  const notes = item ? [
    'Captured and categorized',
    `${item.evidenceCount} evidence ${item.evidenceCount === 1 ? 'item' : 'items'} linked`,
    `Classified as ${item.category}`,
    item.reviewStatus ? `Review: ${item.reviewStatus}` : 'Cleared human review',
    item.status === 'Published' ? `Published ${item.dateLabel}` : `${item.status} ${item.dateLabel}`,
  ] : [];

  return (
    <AnimatePresence>
      {item ? (
        <motion.div className="fixed inset-0 z-50 flex justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.2 }}>
          <button aria-label="Close case" className="absolute inset-0 bg-background-deep/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Case: ${item.title}`}
            className="relative h-full w-full max-w-md overflow-y-auto border-l border-border bg-surface shadow-glow outline-none"
            initial={reduce ? { opacity: 0 } : { x: '100%' }} animate={reduce ? { opacity: 1 } : { x: 0 }} exit={reduce ? { opacity: 0 } : { x: '100%' }}
            transition={{ duration: reduce ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface/95 px-5 py-4 backdrop-blur">
              <span className="text-label uppercase tracking-wide text-text-muted">Investigation</span>
              <button onClick={onClose} className="rounded-lg border border-border bg-surface/80 p-1.5 text-text-secondary transition hover:text-text-primary" aria-label="Close"><X className="h-4 w-4" /></button>
            </div>

            <div className="space-y-6 p-5">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CategoryTag label={item.category} tone={toneForBucket(item.category)} />
                  <RiskBadge level={item.risk_level} />
                  {typeof item.traceabilityScore === 'number' ? <TraceabilityBadge score={item.traceabilityScore} className="ml-auto" /> : null}
                </div>
                <h2 className="text-h5 font-bold text-text-primary">{item.title}</h2>
              </div>

              {/* collaboration — public-safe metadata only */}
              <section className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-body-sm font-semibold text-text-primary"><UserCheck className="h-4 w-4 text-electric" /> Collaboration</h3>
                <ul className="space-y-1.5 text-caption">
                  <Line label="Assigned" value="Analyst pool" />
                  <Line label="Current owner" value="Unassigned" />
                  <Line label="Last update" value={item.dateLabel} />
                  <Line label="Review status" value={item.reviewStatus ?? 'Cleared'} />
                </ul>
                <p className="text-[11px] text-text-muted">Ownership is shown at pool level — individual identities, notes, and messages are not exposed.</p>
              </section>

              {/* traceability facts */}
              <section className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-body-sm font-semibold text-text-primary"><ShieldCheck className="h-4 w-4 text-verified" /> Traceability</h3>
                <dl className="grid grid-cols-2 gap-2">
                  <Fact label="Evidence" value={String(item.evidenceCount)} />
                  <Fact label="Sources" value={String(item.sourceCount)} />
                  <Fact label="Traceability" value={typeof item.traceabilityScore === 'number' ? `${item.traceabilityScore.toFixed(1)}%` : '—'} />
                  <Fact label="Status" value={item.status} />
                </dl>
              </section>

              {/* investigation timeline */}
              <section className="space-y-3">
                <h3 className="text-body-sm font-semibold text-text-primary">Investigation timeline</h3>
                <ol className="relative space-y-4">
                  {STAGES.map((s, i) => {
                    const Icon = s.icon;
                    const last = i === STAGES.length - 1;
                    return (
                      <li key={s.label} className="relative flex gap-3 pl-1">
                        {!last ? <span className="absolute left-[15px] top-8 h-[calc(100%-8px)] w-px bg-border" aria-hidden /> : null}
                        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${s.color}1f`, color: s.color }}>
                          <Icon className="h-4 w-4" />
                          {!reduce ? (
                            <motion.span className="absolute inset-0 rounded-lg" style={{ boxShadow: `0 0 0 1px ${s.color}` }} initial={{ opacity: 0 }} animate={{ opacity: [0, 0.6, 0] }} transition={{ duration: 3, repeat: Infinity, delay: i * 0.5, ease: 'easeInOut' }} />
                          ) : null}
                        </span>
                        <div className="pt-0.5">
                          <div className="text-body-sm font-medium text-text-primary">{s.label}</div>
                          <div className="text-caption text-text-muted">{notes[i]}</div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center justify-between border-b border-border/50 pb-1.5 last:border-0">
      <span className="text-text-muted">{label}</span>
      <span className="font-medium text-text-secondary">{value}</span>
    </li>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-border bg-background-deep/40 px-3 py-2">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-body-sm font-semibold text-text-primary">{value}</dd>
    </div>
  );
}
