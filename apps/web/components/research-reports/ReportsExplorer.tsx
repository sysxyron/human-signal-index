'use client';

// =============================================================================
// HSI Phase 45 — Research Reports explorer (client). Debounced search, faceted
// filters (category / risk / status) with counts, sort (newest / highest
// traceability / highest risk), intelligence-briefing cards, client pagination,
// and an on-demand report detail drawer. Built on the shared, cached public
// dataset (no per-keystroke DB hits). Public-safe.
// =============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Input, Button, Select, CategoryTag, RiskBadge, TraceabilityBadge } from '@hsi/ui';
import { Search, X, FileText, CheckCircle2, ArrowUpRight, SlidersHorizontal } from 'lucide-react';
import {
  toneForBucket, colorForBucket, colorForRiskTier, riskTier,
  type CategoryBucket, type RiskTier,
} from '@/lib/public-intelligence-mapping';
import type { PublicLibrarySignal, SignalLibraryData, LibraryStatus, LibraryFacet } from '@/lib/public-intelligence';
import { ReportDetailDrawer } from './ReportDetailDrawer';

const PAGE = 9;
type Sort = 'newest' | 'traceability' | 'risk';

export function ReportsExplorer({ data }: { data: SignalLibraryData }) {
  const [rawQuery, setRawQuery] = useState('');
  const [query, setQuery] = useState('');
  const [cats, setCats] = useState<Set<CategoryBucket>>(new Set());
  const [risks, setRisks] = useState<Set<RiskTier>>(new Set());
  const [statuses, setStatuses] = useState<Set<LibraryStatus>>(new Set());
  const [sort, setSort] = useState<Sort>('newest');
  const [visible, setVisible] = useState(PAGE);
  const [open, setOpen] = useState<PublicLibrarySignal | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setQuery(rawQuery.trim().toLowerCase()), 200);
    return () => clearTimeout(id);
  }, [rawQuery]);

  const tokens = useMemo(() => query.split(/\s+/).filter(Boolean), [query]);

  const filtered = useMemo(() => {
    const out = data.signals.filter((s) => {
      if (cats.size && !cats.has(s.category)) return false;
      if (risks.size && !risks.has(riskTier(s.risk_level))) return false;
      if (statuses.size && !statuses.has(s.status)) return false;
      if (tokens.length) {
        const hay = `${s.title} ${s.summary} ${s.category} ${s.status}`.toLowerCase();
        if (!tokens.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
    const sorted = [...out];
    if (sort === 'newest') sorted.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
    else if (sort === 'traceability') sorted.sort((a, b) => (b.traceabilityScore ?? -1) - (a.traceabilityScore ?? -1));
    else if (sort === 'risk') sorted.sort((a, b) => b.risk_level - a.risk_level);
    return sorted;
  }, [data.signals, cats, risks, statuses, tokens, sort]);

  useEffect(() => { setVisible(PAGE); }, [query, cats, risks, statuses, sort]);

  const hasData = data.total > 0;
  const shown = filtered.slice(0, visible);

  function toggle<T>(set: Set<T>, value: T, apply: (s: Set<T>) => void) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value); else next.add(value);
    apply(next);
  }
  function clearAll() { setCats(new Set()); setRisks(new Set()); setStatuses(new Set()); setRawQuery(''); }
  const activeFilters = cats.size + risks.size + statuses.size;

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <Input value={rawQuery} onChange={(e) => setRawQuery(e.target.value)} placeholder="Search reports…" className="pl-9" aria-label="Search reports" />
        </div>
        <FacetGroup<CategoryBucket> title="Category" options={data.facets.categories} selected={cats} accent={(k) => colorForBucket(k)} onToggle={(k) => toggle(cats, k, setCats)} />
        <FacetGroup<RiskTier> title="Risk" options={data.facets.risks} selected={risks} accent={(k) => colorForRiskTier(k)} onToggle={(k) => toggle(risks, k, setRisks)} />
        <FacetGroup<LibraryStatus> title="Status" options={data.facets.statuses} selected={statuses} accent={() => '#3B82F6'} onToggle={(k) => toggle(statuses, k, setStatuses)} />
        {activeFilters > 0 || query ? (
          <button onClick={clearAll} className="inline-flex items-center gap-1.5 text-caption font-medium text-electric hover:text-white">
            <X className="h-3.5 w-3.5" /> Clear all filters
          </button>
        ) : null}
      </aside>

      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-caption text-text-muted">
            <SlidersHorizontal className="mr-1.5 inline h-3.5 w-3.5" />
            {hasData ? <>Showing <span className="font-semibold text-text-secondary">{Math.min(visible, filtered.length)}</span> of <span className="font-semibold text-text-secondary">{filtered.length}</span> reports</> : 'Finished intelligence products'}
          </p>
          <label className="flex items-center gap-2 text-caption text-text-muted">
            Sort
            <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="w-48" aria-label="Sort reports">
              <option value="newest">Newest</option>
              <option value="traceability">Highest traceability</option>
              <option value="risk">Highest risk</option>
            </Select>
          </label>
        </div>

        {!hasData ? (
          <EmptyState title="No research reports published yet." hint="Finished intelligence will appear here as it clears human review." />
        ) : filtered.length === 0 ? (
          <EmptyState title="No reports match your filters." hint="Try clearing a filter or broadening your search." />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {shown.map((r) => <ReportCard key={r.id} report={r} onOpen={() => setOpen(r)} />)}
            </div>
            {filtered.length > visible ? (
              <div className="flex justify-center pt-2">
                <Button variant="secondary" onClick={() => setVisible((v) => v + PAGE)}>Load more reports</Button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <ReportDetailDrawer report={open} allReports={data.signals} onClose={() => setOpen(null)} />
    </div>
  );
}

function ReportCard({ report, onOpen }: { report: PublicLibrarySignal; onOpen: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="group flex cursor-pointer flex-col gap-3 rounded-card border border-border bg-surface/60 p-5 transition hover:-translate-y-0.5 hover:border-electric/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-electric/70"
    >
      <div className="flex flex-wrap items-center gap-2">
        <CategoryTag label={report.category} tone={toneForBucket(report.category)} />
        <RiskBadge level={report.risk_level} />
        <span className="ml-auto inline-flex items-center gap-1 text-caption text-verified"><CheckCircle2 className="h-3.5 w-3.5" /> Human-reviewed</span>
      </div>
      <h3 className="text-h6 font-semibold leading-snug text-text-primary">{report.title}</h3>
      <p className="line-clamp-3 text-body-sm leading-relaxed text-text-secondary">{report.summary || 'Traceable public intelligence product.'}</p>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3 text-caption text-text-muted">
        <span className="inline-flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> {report.evidenceCount} evidence</span>
        {typeof report.traceabilityScore === 'number' ? <TraceabilityBadge score={report.traceabilityScore} /> : <span>{report.dateLabel}</span>}
      </div>
      <span className="inline-flex items-center gap-1 text-caption font-semibold text-electric group-hover:text-white">
        Read briefing <ArrowUpRight className="h-3.5 w-3.5" />
      </span>
    </div>
  );
}

function FacetGroup<T extends string>({ title, options, selected, accent, onToggle }: {
  title: string; options: LibraryFacet<T>[]; selected: Set<T>; accent: (k: T) => string; onToggle: (k: T) => void;
}) {
  return (
    <div className="rounded-card border border-border bg-surface/40 p-3">
      <h3 className="mb-2 text-label uppercase tracking-wide text-text-muted">{title}</h3>
      <ul className="space-y-1">
        {options.map((o) => {
          const on = selected.has(o.key);
          return (
            <li key={o.key}>
              <button onClick={() => onToggle(o.key)} aria-pressed={on}
                className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-body-sm transition ${on ? 'bg-electric/15 font-semibold text-text-primary' : 'text-text-secondary hover:bg-surface-2'}`}>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accent(o.key), opacity: on ? 1 : 0.6 }} />
                  {o.key}
                </span>
                <span className="tabular-nums text-caption text-text-muted">{o.count}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-card border border-dashed border-border/70 bg-background-deep/30 px-6 py-14 text-center">
      <p className="text-body font-medium text-text-secondary">{title}</p>
      <p className="mt-1 text-caption text-text-muted">{hint}</p>
    </div>
  );
}
