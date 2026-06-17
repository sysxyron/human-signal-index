'use client';

// =============================================================================
// HSI Phase 46 — Source detail drawer (on-demand). Public-safe per-source
// intelligence: relationships (Source → Signals → Reports), a lifecycle timeline
// (added / validated / last seen / recent activity / publication influence), and
// a reliability panel (coverage / activity / signal yield / review outcomes /
// reliability trend). Reduced-motion aware. NEVER exposes PII, reviewer
// identities, internal notes, or admin-only metadata.
// =============================================================================

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X, ArrowRight, Radio, FileText, Database, Clock, ShieldCheck, ArrowUpRight } from 'lucide-react';
import { colorForBucket } from '@/lib/public-intelligence-mapping';
import type { SourceIntelItem } from '@/lib/source-intelligence';

const STATUS_COLOR: Record<string, string> = { Active: '#10B981', Paused: '#F59E0B', Disabled: '#94A3B8', Failing: '#EF4444' };

export function SourceDetailDrawer({ source, onClose }: { source: SourceIntelItem | null; onClose: () => void }) {
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!source) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [source, onClose]);

  return (
    <AnimatePresence>
      {source ? (
        <motion.div
          className="fixed inset-0 z-50 flex justify-end"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.2 }}
        >
          <button aria-label="Close source detail" className="absolute inset-0 bg-background-deep/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={`Source detail: ${source.name}`}
            className="relative h-full w-full max-w-md overflow-y-auto border-l border-border bg-surface shadow-glow outline-none"
            initial={reduce ? { opacity: 0 } : { x: '100%' }}
            animate={reduce ? { opacity: 1 } : { x: 0 }}
            exit={reduce ? { opacity: 0 } : { x: '100%' }}
            transition={{ duration: reduce ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface/95 px-5 py-4 backdrop-blur">
              <span className="text-label uppercase tracking-wide text-text-muted">Source intelligence</span>
              <button onClick={onClose} className="rounded-lg border border-border bg-surface/80 p-1.5 text-text-secondary transition hover:text-text-primary" aria-label="Close"><X className="h-4 w-4" /></button>
            </div>

            <div className="space-y-6 p-5">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-border bg-surface-2/50 px-2.5 py-1 text-[11px] font-medium text-text-secondary">{source.type}</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ backgroundColor: `${STATUS_COLOR[source.status]}1f`, color: STATUS_COLOR[source.status] }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_COLOR[source.status] }} />{source.status}
                  </span>
                </div>
                <h2 className="text-h5 font-bold text-text-primary">{source.name}</h2>
              </div>

              {/* scores */}
              <div className="grid grid-cols-2 gap-3">
                <Gauge label="Health" value={source.healthScore} color="#10B981" />
                <Gauge label="Reliability" value={source.trustScore} color="#3B82F6" />
              </div>

              {/* relationships */}
              <section className="space-y-2">
                <SectionTitle icon={<Database className="h-4 w-4 text-electric" />}>Relationships</SectionTitle>
                <div className="flex items-center gap-2 rounded-card border border-border bg-background-deep/40 p-3 text-caption">
                  <Node icon={<Database className="h-4 w-4" />} label="Source" value={source.name} color="#3B82F6" />
                  <ArrowRight className="h-4 w-4 shrink-0 text-text-muted" />
                  <Node icon={<Radio className="h-4 w-4" />} label="Signals" value={String(source.signals)} color="#8B5CF6" />
                  <ArrowRight className="h-4 w-4 shrink-0 text-text-muted" />
                  <Node icon={<FileText className="h-4 w-4" />} label="Reports" value={source.coverageCategory} color="#10B981" />
                </div>
                <a href="/research-reports" className="inline-flex items-center gap-1.5 text-caption font-semibold text-electric hover:text-white">
                  See {source.coverageCategory} reports <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              </section>

              {/* timeline */}
              <section className="space-y-2">
                <SectionTitle icon={<Clock className="h-4 w-4 text-electric" />}>Lifecycle timeline</SectionTitle>
                <ul className="space-y-1.5 text-caption">
                  <Line label="Added" value={source.addedLabel} />
                  <Line label="Validated" value={source.status === 'Active' ? 'Monitoring active' : source.status} />
                  <Line label="Last seen" value={source.lastActivityLabel} />
                  <Line label="Recent activity" value={`${source.recentSignals} signals · 30d`} />
                  <Line label="Publication influence" value={`Feeds ${source.coverageCategory} reporting`} />
                </ul>
              </section>

              {/* reliability */}
              <section className="space-y-3">
                <SectionTitle icon={<ShieldCheck className="h-4 w-4 text-verified" />}>Source reliability</SectionTitle>
                <dl className="grid grid-cols-2 gap-2">
                  <Fact label="Signal yield" value={source.signals.toLocaleString('en-US')} />
                  <Fact label="Activity (30d)" value={source.recentSignals.toLocaleString('en-US')} />
                  <Fact label="Approved" value={source.approved.toLocaleString('en-US')} />
                  <Fact label="Rejected" value={source.rejected.toLocaleString('en-US')} />
                </dl>
                {source.categoryCounts.length > 0 ? (
                  <div>
                    <h4 className="mb-1.5 text-caption font-semibold uppercase tracking-wide text-text-muted">Coverage</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {source.categoryCounts.slice(0, 5).map((c) => (
                        <span key={c.category} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2/50 px-2.5 py-1 text-[11px] text-text-secondary">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colorForBucket(c.category) }} />
                          {c.category} <span className="text-text-muted">{c.count}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div>
                  <h4 className="mb-1.5 text-caption font-semibold uppercase tracking-wide text-text-muted">Reliability trend</h4>
                  <TrendBars trend={source.trend} />
                </div>
              </section>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <h3 className="flex items-center gap-1.5 text-body-sm font-semibold text-text-primary">{icon} {children}</h3>;
}

function Gauge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-card border border-border bg-background-deep/40 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</span>
        <span className="text-body-sm font-bold tabular-nums" style={{ color }}>{value}%</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function Node({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}1f`, color }}>{icon}</span>
      <span className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</span>
      <span className="w-full truncate text-[11px] font-semibold text-text-primary">{value}</span>
    </div>
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
      <dd className="mt-0.5 text-body-sm font-semibold text-text-primary">{value}</dd>
    </div>
  );
}

function TrendBars({ trend }: { trend: number[] }) {
  const max = Math.max(1, ...trend);
  return (
    <div className="flex h-12 items-end gap-1.5">
      {trend.map((v, i) => (
        <div key={i} className="flex-1 rounded-t bg-electric/70" style={{ height: `${Math.max(4, (v / max) * 100)}%` }} title={`${v}`} />
      ))}
    </div>
  );
}
