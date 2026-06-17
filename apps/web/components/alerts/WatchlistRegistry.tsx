'use client';

// =============================================================================
// HSI Phase 51 — Watchlist registry + detail drawer (client). A grid of
// intelligence watchlists (category + composite) with counts and active-alert
// badges; clicking opens a read-only detail drawer (summary, active alerts,
// recent reports, source contribution). Detail is precomputed server-side and
// passed as props — no client fetch. Reduced-motion aware. Public-safe.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Eye, X, FileText, Database, Bell } from 'lucide-react';
import { colorForBucket } from '@/lib/public-intelligence-mapping';
import type { Watchlist, Alert, AlertSeverity } from '@/lib/alerts-intelligence';

const SEV_COLOR: Record<AlertSeverity, string> = {
  Critical: '#B91C1C', High: '#EF4444', Moderate: '#F59E0B', Low: '#3B82F6', Informational: '#94A3B8',
};

export function WatchlistRegistry({ watchlists, alerts }: { watchlists: Watchlist[]; alerts: Alert[] }) {
  const [open, setOpen] = useState<Watchlist | null>(null);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {watchlists.map((w) => (
          <div
            key={w.id}
            role="button" tabIndex={0} onClick={() => setOpen(w)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(w); } }}
            className="group flex cursor-pointer flex-col gap-2 rounded-card border border-border bg-surface/60 p-4 transition hover:-translate-y-0.5 hover:border-electric/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-electric/70"
          >
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `${SEV_COLOR[w.severity]}1f`, color: SEV_COLOR[w.severity] }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: SEV_COLOR[w.severity] }} />{w.severity}
              </span>
              {w.activeAlerts > 0 ? <span className="inline-flex items-center gap-1 text-caption text-risk"><Bell className="h-3.5 w-3.5" /> {w.activeAlerts}</span> : null}
            </div>
            <h3 className="text-body font-semibold leading-snug text-text-primary">{w.name}</h3>
            <div className="mt-auto flex items-end justify-between">
              <span className="text-h4 font-bold tabular-nums text-text-primary">{w.count.toLocaleString('en-US')}</span>
              <span className="inline-flex items-center gap-1 text-caption font-semibold text-electric group-hover:text-white"><Eye className="h-3.5 w-3.5" /> Inspect</span>
            </div>
          </div>
        ))}
      </div>
      <WatchlistDrawer watchlist={open} alerts={alerts} onClose={() => setOpen(null)} />
    </div>
  );
}

function WatchlistDrawer({ watchlist, alerts, onClose }: { watchlist: Watchlist | null; alerts: Alert[]; onClose: () => void }) {
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!watchlist) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [watchlist, onClose]);

  const active = watchlist ? alerts.filter((a) => a.watchlist === watchlist.name) : [];
  const maxSig = watchlist ? Math.max(1, ...watchlist.sourceContribution.map((s) => s.signals)) : 1;

  return (
    <AnimatePresence>
      {watchlist ? (
        <motion.div className="fixed inset-0 z-50 flex justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.2 }}>
          <button aria-label="Close watchlist" className="absolute inset-0 bg-background-deep/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Watchlist: ${watchlist.name}`}
            className="relative h-full w-full max-w-md overflow-y-auto border-l border-border bg-surface shadow-glow outline-none"
            initial={reduce ? { opacity: 0 } : { x: '100%' }} animate={reduce ? { opacity: 1 } : { x: 0 }} exit={reduce ? { opacity: 0 } : { x: '100%' }}
            transition={{ duration: reduce ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface/95 px-5 py-4 backdrop-blur">
              <span className="text-label uppercase tracking-wide text-text-muted">Watchlist</span>
              <button onClick={onClose} className="rounded-lg border border-border bg-surface/80 p-1.5 text-text-secondary transition hover:text-text-primary" aria-label="Close"><X className="h-4 w-4" /></button>
            </div>

            <div className="space-y-6 p-5">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-semibold" style={{ backgroundColor: `${SEV_COLOR[watchlist.severity]}1f`, color: SEV_COLOR[watchlist.severity] }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: SEV_COLOR[watchlist.severity] }} />{watchlist.severity}
                  </span>
                  <span className="text-caption text-text-muted">{watchlist.count.toLocaleString('en-US')} items</span>
                </div>
                <h2 className="text-h5 font-bold text-text-primary">{watchlist.name}</h2>
                <p className="text-body-sm text-text-secondary">{watchlist.description}</p>
              </div>

              <Section title="Active alerts">
                {active.length === 0 ? <Empty text="No active alerts for this watchlist." /> : (
                  <ul className="space-y-1.5">
                    {active.map((a) => (
                      <li key={a.id} className="flex items-start gap-2 rounded-card border border-border bg-background-deep/40 px-3 py-2">
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: SEV_COLOR[a.severity] }} />
                        <div className="min-w-0"><div className="text-body-sm font-medium text-text-primary">{a.title}</div><div className="text-caption text-text-muted">{a.detail}</div></div>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Recent reports">
                {watchlist.recentReports.length === 0 ? <Empty text="No recent reports." /> : (
                  <ul className="space-y-1.5">
                    {watchlist.recentReports.map((r) => (
                      <li key={r.id} className="flex items-center gap-2 rounded-card border border-border bg-background-deep/40 px-3 py-2">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                        <span className="min-w-0 flex-1 truncate text-body-sm text-text-secondary">{r.title}</span>
                        <span className="shrink-0 text-caption text-text-muted">{r.dateLabel}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Source contribution">
                {watchlist.sourceContribution.length === 0 ? <Empty text="No source contribution data." /> : (
                  <ul className="space-y-2">
                    {watchlist.sourceContribution.map((s) => (
                      <li key={s.category} className="space-y-1">
                        <div className="flex items-center justify-between text-caption">
                          <span className="flex items-center gap-2 text-text-secondary"><Database className="h-3.5 w-3.5 text-text-muted" />{s.category}</span>
                          <span className="text-text-muted">{s.sources} {s.sources === 1 ? 'source' : 'sources'} · {s.signals} signals</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${Math.round((s.signals / maxSig) * 100)}%`, backgroundColor: colorForBucket(s.category), opacity: 0.85 }} /></div>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-2"><h3 className="text-body-sm font-semibold text-text-primary">{title}</h3>{children}</section>;
}
function Empty({ text }: { text: string }) {
  return <p className="rounded-card border border-dashed border-border/70 bg-background-deep/30 px-3 py-4 text-center text-caption text-text-muted">{text}</p>;
}
