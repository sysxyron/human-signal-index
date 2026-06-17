'use client';

// =============================================================================
// HSI Phase 44 — Signal detail drawer + evidence timeline.
//
// A right-side slide-over that opens when a signal card is activated. Shows the
// public-safe detail: summary, category, risk, evidence linked, traceability,
// human-review status, publication history, and a read-only evidence timeline
// (Signal → Evidence → Analysis → Human Review → Publication). Reduced-motion
// aware; closes on backdrop click or Escape; accessible (role=dialog).
// =============================================================================

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { RiskBadge, CategoryTag, TraceabilityBadge } from '@hsi/ui';
import { Radio, Link2, ScanText, Users, BadgeCheck, X, ShieldCheck } from 'lucide-react';
import { toneForBucket } from '@/lib/public-intelligence-mapping';
import type { PublicLibrarySignal } from '@/lib/public-intelligence';

export function SignalDetailDrawer({ signal, onClose }: { signal: PublicLibrarySignal | null; onClose: () => void }) {
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!signal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [signal, onClose]);

  return (
    <AnimatePresence>
      {signal ? (
        <motion.div
          className="fixed inset-0 z-50 flex justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
        >
          {/* backdrop */}
          <button aria-label="Close detail" className="absolute inset-0 bg-background-deep/70 backdrop-blur-sm" onClick={onClose} />

          {/* panel */}
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={`Signal detail: ${signal.title}`}
            className="relative h-full w-full max-w-md overflow-y-auto border-l border-border bg-surface shadow-glow outline-none"
            initial={reduce ? { opacity: 0 } : { x: '100%' }}
            animate={reduce ? { opacity: 1 } : { x: 0 }}
            exit={reduce ? { opacity: 0 } : { x: '100%' }}
            transition={{ duration: reduce ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface/95 px-5 py-4 backdrop-blur">
              <span className="text-label uppercase tracking-wide text-text-muted">Signal detail</span>
              <button onClick={onClose} className="rounded-lg border border-border bg-surface/80 p-1.5 text-text-secondary transition hover:text-text-primary" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-6 p-5">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CategoryTag label={signal.category} tone={toneForBucket(signal.category)} />
                  <RiskBadge level={signal.risk_level} />
                  {typeof signal.traceabilityScore === 'number' ? <TraceabilityBadge score={signal.traceabilityScore} className="ml-auto" /> : null}
                </div>
                <h2 className="text-h4 font-bold leading-snug text-text-primary">{signal.title}</h2>
                {signal.summary ? <p className="text-body-sm leading-relaxed text-text-secondary">{signal.summary}</p> : null}
              </div>

              {/* fact grid */}
              <dl className="grid grid-cols-2 gap-3">
                <Fact label="Category" value={signal.category} />
                <Fact label="Risk" value={tierLabel(signal.risk_level)} />
                <Fact label="Evidence linked" value={String(signal.evidenceCount)} />
                <Fact label="Sources" value={String(signal.sourceCount)} />
                <Fact label="Traceability" value={typeof signal.traceabilityScore === 'number' ? `${signal.traceabilityScore.toFixed(1)}%` : '—'} />
                <Fact label="Human review" value={signal.reviewStatus ?? 'Cleared'} />
              </dl>

              {/* publication history */}
              <div className="rounded-card border border-border bg-background-deep/40 p-4">
                <div className="mb-2 flex items-center gap-1.5 text-body-sm font-semibold text-text-primary">
                  <ShieldCheck className="h-4 w-4 text-verified" /> Publication history
                </div>
                <ul className="space-y-1.5 text-caption text-text-secondary">
                  <li className="flex items-center justify-between"><span>Status</span><span className="font-medium text-text-primary">{signal.status}</span></li>
                  <li className="flex items-center justify-between"><span>Published</span><span className="font-medium text-text-primary">{signal.dateLabel}</span></li>
                  {typeof signal.confidence === 'number' ? (
                    <li className="flex items-center justify-between"><span>Confidence</span><span className="font-medium text-text-primary">{Math.round(signal.confidence * 100)}%</span></li>
                  ) : null}
                </ul>
              </div>

              {/* evidence timeline */}
              <div>
                <h3 className="mb-3 text-body-sm font-semibold text-text-primary">Evidence chain</h3>
                <EvidenceTimeline signal={signal} reduce={reduce} />
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
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

function tierLabel(level: number): string {
  if (level >= 5) return 'Critical';
  if (level === 4) return 'High';
  if (level === 3) return 'Moderate';
  return 'Low';
}

const STAGES = [
  { icon: Radio, label: 'Signal', color: '#3B82F6' },
  { icon: Link2, label: 'Evidence', color: '#10B981' },
  { icon: ScanText, label: 'Analysis', color: '#8B5CF6' },
  { icon: Users, label: 'Human Review', color: '#F59E0B' },
  { icon: BadgeCheck, label: 'Publication', color: '#10B981' },
] as const;

function EvidenceTimeline({ signal, reduce }: { signal: PublicLibrarySignal; reduce: boolean | null }) {
  const notes: string[] = [
    'Captured and categorized',
    `${signal.evidenceCount} evidence ${signal.evidenceCount === 1 ? 'item' : 'items'} linked`,
    `Classified as ${signal.category}`,
    signal.reviewStatus ? `Review: ${signal.reviewStatus}` : 'Cleared human review',
    signal.status === 'Published' ? `Published ${signal.dateLabel}` : `Archived ${signal.dateLabel}`,
  ];
  return (
    <ol className="relative space-y-4 pl-2">
      {STAGES.map((s, i) => {
        const Icon = s.icon;
        return (
          <li key={s.label} className="relative flex gap-3">
            {i < STAGES.length - 1 ? <span className="absolute left-[15px] top-8 h-[calc(100%-8px)] w-px bg-border" aria-hidden /> : null}
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${s.color}1f`, color: s.color }}>
              <Icon className="h-4 w-4" />
              {!reduce ? (
                <motion.span
                  className="absolute inset-0 rounded-lg"
                  style={{ boxShadow: `0 0 0 1px ${s.color}` }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 0.6, 0] }}
                  transition={{ duration: 3, repeat: Infinity, delay: i * 0.5, ease: 'easeInOut' }}
                />
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
  );
}
