'use client';

// =============================================================================
// HSI Phase 45 — Research report detail drawer (on-demand reading experience).
//
// Opens when a report card is activated. A long-form, public-safe intelligence
// reading panel with: a reading-progress indicator, sticky report metadata,
// anchor navigation, a Trust & Governance strip, an Executive Summary panel, an
// Intelligence Timeline, a Traceability Center, and Related Intelligence. Links
// out to the full sectioned report at /intelligence/[slug]. Reduced-motion aware;
// closes on backdrop click / Escape. No raw source or reviewer identities.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { RiskBadge, CategoryTag, TraceabilityBadge } from '@hsi/ui';
import {
  Radio, Link2, ScanText, Users, BadgeCheck, X, ArrowUpRight, ShieldCheck, GitBranch, FileText, Library,
} from 'lucide-react';
import { toneForBucket, type CategoryBucket } from '@/lib/public-intelligence-mapping';
import type { PublicLibrarySignal } from '@/lib/public-intelligence';
import { TrustStrip } from './TrustStrip';

const NARRATIVE_CHILDREN: Partial<Record<CategoryBucket, string[]>> = {
  Influence: ['Recruitment', 'Propaganda', 'Misinformation'],
  Misinformation: ['Health', 'Civic', 'Extremism'],
  Recruitment: ['Ideology', 'Mobilization'],
  Extremism: ['Radicalization', 'Targeting'],
  Propaganda: ['State-aligned', 'Astroturf'],
  Other: ['Emerging'],
};

const SECTIONS = [
  { id: 'summary', label: 'Summary' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'traceability', label: 'Traceability' },
  { id: 'related', label: 'Related' },
] as const;

function tierLabel(level: number): string {
  if (level >= 5) return 'Critical';
  if (level === 4) return 'High';
  if (level === 3) return 'Moderate';
  return 'Low';
}

function keyFindings(summary: string): string[] {
  return summary
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8)
    .slice(0, 3);
}

export function ReportDetailDrawer({ report, allReports, onClose }: {
  report: PublicLibrarySignal | null;
  allReports: PublicLibrarySignal[];
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!report) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    setProgress(0);
    return () => document.removeEventListener('keydown', onKey);
  }, [report, onClose]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    setProgress(max > 0 ? Math.min(100, Math.round((el.scrollTop / max) * 100)) : 0);
  };

  const goto = (id: string) => {
    const root = scrollRef.current;
    const target = root?.querySelector<HTMLElement>(`#drawer-${id}`);
    if (root && target) root.scrollTo({ top: target.offsetTop - 8, behavior: reduce ? 'auto' : 'smooth' });
  };

  const related = report ? allReports.filter((r) => r.category === report.category && r.id !== report.id).slice(0, 4) : [];
  const categoryCount = report ? allReports.filter((r) => r.category === report.category).length : 0;
  const otherCategories = report
    ? Array.from(new Set(allReports.map((r) => r.category))).filter((c) => c !== report.category).slice(0, 5)
    : [];
  const findings = report ? keyFindings(report.summary) : [];

  return (
    <AnimatePresence>
      {report ? (
        <motion.div
          className="fixed inset-0 z-50 flex justify-end"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
        >
          <button aria-label="Close report" className="absolute inset-0 bg-background-deep/70 backdrop-blur-sm" onClick={onClose} />

          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={`Research report: ${report.title}`}
            className="relative flex h-full w-full max-w-xl flex-col border-l border-border bg-surface shadow-glow outline-none"
            initial={reduce ? { opacity: 0 } : { x: '100%' }}
            animate={reduce ? { opacity: 1 } : { x: 0 }}
            exit={reduce ? { opacity: 0 } : { x: '100%' }}
            transition={{ duration: reduce ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* reading progress */}
            <div className="h-0.5 w-full bg-border">
              <div className="h-full bg-electric transition-[width] duration-150" style={{ width: `${progress}%` }} />
            </div>

            {/* sticky metadata header */}
            <div className="sticky top-0 z-10 border-b border-border bg-surface/95 px-5 py-3 backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <CategoryTag label={report.category} tone={toneForBucket(report.category)} />
                    <RiskBadge level={report.risk_level} />
                  </div>
                  <h2 className="truncate text-h6 font-bold text-text-primary">{report.title}</h2>
                  <p className="text-caption text-text-muted">{report.status} · {report.dateLabel}</p>
                </div>
                <button onClick={onClose} className="shrink-0 rounded-lg border border-border bg-surface/80 p-1.5 text-text-secondary transition hover:text-text-primary" aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {/* anchor navigation */}
              <nav className="mt-2 flex gap-1 overflow-x-auto">
                {SECTIONS.map((s) => (
                  <button key={s.id} onClick={() => goto(s.id)} className="shrink-0 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-text-secondary transition hover:border-electric hover:text-text-primary">
                    {s.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* scrollable body */}
            <div ref={scrollRef} onScroll={onScroll} className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
              <TrustStrip compact />

              {/* executive summary */}
              <section id="drawer-summary" className="scroll-mt-4 space-y-3">
                <SectionTitle icon={<FileText className="h-4 w-4 text-electric" />}>Executive summary</SectionTitle>
                {report.summary ? (
                  <p className="text-body-sm leading-relaxed text-text-secondary">{report.summary}</p>
                ) : (
                  <p className="text-caption text-text-muted">Summary available in the full report.</p>
                )}
                {findings.length > 0 ? (
                  <div>
                    <h4 className="mb-1.5 text-caption font-semibold uppercase tracking-wide text-text-muted">Key findings</h4>
                    <ul className="space-y-1.5">
                      {findings.map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-body-sm text-text-secondary">
                          <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-verified" /> {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <dl className="grid grid-cols-2 gap-2">
                  <Fact label="Risk assessment" value={tierLabel(report.risk_level)} />
                  <Fact label="Confidence" value={typeof report.confidence === 'number' ? `${Math.round(report.confidence * 100)}%` : '—'} />
                  <Fact label="Traceability" value={typeof report.traceabilityScore === 'number' ? `${report.traceabilityScore.toFixed(1)}%` : '—'} />
                  <Fact label="Human review" value={report.reviewStatus ?? 'Cleared'} />
                </dl>
              </section>

              {/* intelligence timeline */}
              <section id="drawer-timeline" className="scroll-mt-4 space-y-3">
                <SectionTitle icon={<GitBranch className="h-4 w-4 text-electric" />}>Intelligence timeline</SectionTitle>
                <Timeline report={report} reduce={reduce} />
              </section>

              {/* traceability center */}
              <section id="drawer-traceability" className="scroll-mt-4 space-y-3">
                <SectionTitle icon={<ShieldCheck className="h-4 w-4 text-verified" />}>Traceability center</SectionTitle>
                <dl className="grid grid-cols-2 gap-2">
                  <Fact label="Evidence count" value={String(report.evidenceCount)} />
                  <Fact label="Sources referenced" value={String(report.sourceCount)} />
                  <Fact label="Review status" value={report.reviewStatus ?? 'Cleared'} />
                  <Fact label="Traceability score" value={typeof report.traceabilityScore === 'number' ? `${report.traceabilityScore.toFixed(1)}%` : '—'} />
                  <Fact label="Corrections" value="None on record" />
                  <Fact label="Version" value={report.status === 'Published' ? 'Current (1.0)' : report.status} />
                </dl>
                <p className="text-[11px] text-text-muted">Source and reviewer identities are withheld by design. Publication status: <span className="font-medium text-text-secondary">{report.status}</span>, {report.dateLabel}.</p>
              </section>

              {/* related intelligence */}
              <section id="drawer-related" className="scroll-mt-4 space-y-3">
                <SectionTitle icon={<Library className="h-4 w-4 text-electric" />}>Related intelligence</SectionTitle>

                {related.length > 0 ? (
                  <div>
                    <h4 className="mb-1.5 text-caption font-semibold uppercase tracking-wide text-text-muted">Related reports</h4>
                    <ul className="space-y-1.5">
                      {related.map((r) => (
                        <li key={r.id} className="flex items-center gap-2 rounded-card border border-border bg-background-deep/40 px-3 py-2">
                          <RiskBadge level={r.risk_level} />
                          <span className="min-w-0 flex-1 truncate text-body-sm text-text-secondary">{r.title}</span>
                          <span className="shrink-0 text-caption text-text-muted">{r.dateLabel}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-caption text-text-muted">No related reports in this category yet.</p>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <h4 className="mb-1.5 text-caption font-semibold uppercase tracking-wide text-text-muted">Related narrative types</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {(NARRATIVE_CHILDREN[report.category] ?? []).map((c) => (
                        <span key={c} className="rounded-full border border-border bg-surface-2/50 px-2.5 py-1 text-[11px] text-text-secondary">{c}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="mb-1.5 text-caption font-semibold uppercase tracking-wide text-text-muted">Related categories</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {otherCategories.map((c) => (
                        <span key={c} className="rounded-full border border-border bg-surface-2/50 px-2.5 py-1 text-[11px] text-text-secondary">{c}</span>
                      ))}
                    </div>
                  </div>
                </div>

                <a href={`/signal-library`} className="inline-flex items-center gap-1.5 text-caption font-semibold text-electric hover:text-white">
                  Explore {report.category} signals ({categoryCount}) <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              </section>
            </div>

            {/* footer — full report */}
            <div className="border-t border-border bg-surface/95 px-5 py-3 backdrop-blur">
              <a href={`/intelligence/${report.id}`} className="flex items-center justify-center gap-1.5 rounded-btn bg-electric px-4 py-2 text-body-sm font-semibold text-white transition hover:opacity-90">
                Open full report <ArrowUpRight className="h-4 w-4" />
              </a>
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-border bg-background-deep/40 px-3 py-2">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-body-sm font-semibold text-text-primary">{value}</dd>
    </div>
  );
}

const STAGES = [
  { icon: Radio, label: 'Signal detected', color: '#3B82F6' },
  { icon: Link2, label: 'Evidence collected', color: '#10B981' },
  { icon: ScanText, label: 'Analysis completed', color: '#8B5CF6' },
  { icon: Users, label: 'Human review', color: '#F59E0B' },
  { icon: BadgeCheck, label: 'Report published', color: '#10B981' },
] as const;

function Timeline({ report, reduce }: { report: PublicLibrarySignal; reduce: boolean | null }) {
  const notes = [
    'Captured and categorized',
    `${report.evidenceCount} evidence ${report.evidenceCount === 1 ? 'item' : 'items'} collected`,
    `Classified as ${report.category}`,
    report.reviewStatus ? `Review: ${report.reviewStatus}` : 'Cleared human review',
    report.status === 'Published' ? `Published ${report.dateLabel}` : `${report.status} ${report.dateLabel}`,
  ];
  return (
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
                <motion.span className="absolute inset-0 rounded-lg" style={{ boxShadow: `0 0 0 1px ${s.color}` }}
                  initial={{ opacity: 0 }} animate={{ opacity: [0, 0.6, 0] }} transition={{ duration: 3, repeat: Infinity, delay: i * 0.5, ease: 'easeInOut' }} />
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
