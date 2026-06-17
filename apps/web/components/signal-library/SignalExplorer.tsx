'use client';

// =============================================================================
// HSI Phase 44 — Signal Library intelligence explorer (client).
//
// Debounced keyword search across title/summary/category/status, faceted filters
// (category / risk / status) with counts, a clickable category heatmap, an
// intelligence-card grid with client-side pagination, and a detail drawer. The
// dataset is fetched once (cached, server-side) and filtered in-memory, so search
// + faceting are instant and never hit the DB per keystroke. Public-safe.
// =============================================================================

import { useEffect, useMemo, useState } from 'react';
import { SignalCard, Input, Button } from '@hsi/ui';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import {
  toneForBucket,
  colorForBucket,
  colorForRiskTier,
  riskTier,
  CATEGORY_BUCKETS,
  RISK_TIERS,
  type CategoryBucket,
  type RiskTier,
  type CategoryActivity,
} from '@/lib/public-intelligence-mapping';
import type { PublicLibrarySignal, SignalLibraryData, LibraryStatus, LibraryFacet } from '@/lib/public-intelligence';
import { SignalDetailDrawer } from './SignalDetailDrawer';

const PAGE = 12;

export function SignalExplorer({ data }: { data: SignalLibraryData }) {
  const [rawQuery, setRawQuery] = useState('');
  const [query, setQuery] = useState('');
  const [cats, setCats] = useState<Set<CategoryBucket>>(new Set());
  const [risks, setRisks] = useState<Set<RiskTier>>(new Set());
  const [statuses, setStatuses] = useState<Set<LibraryStatus>>(new Set());
  const [visible, setVisible] = useState(PAGE);
  const [open, setOpen] = useState<PublicLibrarySignal | null>(null);

  // Debounce the search input.
  useEffect(() => {
    const id = setTimeout(() => setQuery(rawQuery.trim().toLowerCase()), 200);
    return () => clearTimeout(id);
  }, [rawQuery]);

  const tokens = useMemo(() => query.split(/\s+/).filter(Boolean), [query]);

  const filtered = useMemo(() => {
    return data.signals.filter((s) => {
      if (cats.size && !cats.has(s.category)) return false;
      if (risks.size && !risks.has(riskTier(s.risk_level))) return false;
      if (statuses.size && !statuses.has(s.status)) return false;
      if (tokens.length) {
        const hay = `${s.title} ${s.summary} ${s.category} ${s.status}`.toLowerCase();
        if (!tokens.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
  }, [data.signals, cats, risks, statuses, tokens]);

  // Reset pagination whenever the result set changes.
  useEffect(() => { setVisible(PAGE); }, [query, cats, risks, statuses]);

  const hasData = data.total > 0;
  const activeFilters = cats.size + risks.size + statuses.size;
  const shown = filtered.slice(0, visible);

  function toggle<T>(set: Set<T>, value: T, apply: (s: Set<T>) => void) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value); else next.add(value);
    apply(next);
  }
  function clearAll() { setCats(new Set()); setRisks(new Set()); setStatuses(new Set()); setRawQuery(''); }

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      {/* ---- filter rail ---- */}
      <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <Input value={rawQuery} onChange={(e) => setRawQuery(e.target.value)} placeholder="Search signals…" className="pl-9" aria-label="Search signals" />
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

      {/* ---- results ---- */}
      <div className="space-y-5">
        <CategoryHeatmap activity={data.categoryActivity} active={cats} onToggle={(k) => toggle(cats, k, setCats)} />

        <div className="flex items-center justify-between">
          <p className="text-caption text-text-muted">
            <SlidersHorizontal className="mr-1.5 inline h-3.5 w-3.5" />
            {hasData ? <>Showing <span className="font-semibold text-text-secondary">{Math.min(visible, filtered.length)}</span> of <span className="font-semibold text-text-secondary">{filtered.length}</span> signals</> : 'Live signal records'}
          </p>
        </div>

        {!hasData ? (
          <EmptyState title="No public signals published yet." hint="Published intelligence will appear here as it clears human review." />
        ) : filtered.length === 0 ? (
          <EmptyState title="No signals match your filters." hint="Try clearing a filter or broadening your search." />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {shown.map((s) => (
                <SignalCard
                  key={s.id}
                  title={s.title}
                  summary={s.summary || 'Traceable public intelligence record.'}
                  category={s.category}
                  categoryTone={toneForBucket(s.category)}
                  riskLevel={s.risk_level}
                  traceability={s.traceabilityScore ?? 0}
                  source={`${s.evidenceCount} evidence · ${s.sourceCount} sources`}
                  date={s.dateLabel}
                  onOpen={() => setOpen(s)}
                />
              ))}
            </div>
            {filtered.length > visible ? (
              <div className="flex justify-center pt-2">
                <Button variant="secondary" onClick={() => setVisible((v) => v + PAGE)}>Load more signals</Button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <SignalDetailDrawer signal={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function FacetGroup<T extends string>({ title, options, selected, accent, onToggle }: {
  title: string;
  options: LibraryFacet<T>[];
  selected: Set<T>;
  accent: (k: T) => string;
  onToggle: (k: T) => void;
}) {
  return (
    <div className="rounded-card border border-border bg-surface/40 p-3">
      <h3 className="mb-2 text-label uppercase tracking-wide text-text-muted">{title}</h3>
      <ul className="space-y-1">
        {options.map((o) => {
          const on = selected.has(o.key);
          return (
            <li key={o.key}>
              <button
                onClick={() => onToggle(o.key)}
                aria-pressed={on}
                className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-body-sm transition ${on ? 'bg-electric/15 font-semibold text-text-primary' : 'text-text-secondary hover:bg-surface-2'}`}
              >
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

function CategoryHeatmap({ activity, active, onToggle }: { activity: CategoryActivity[]; active: Set<CategoryBucket>; onToggle: (k: CategoryBucket) => void }) {
  const counts = new Map<CategoryBucket, number>(activity.map((a) => [a.category, a.count]));
  const max = Math.max(1, ...activity.map((a) => a.count));
  return (
    <div className="rounded-card border border-border bg-surface/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-label uppercase tracking-wide text-text-muted">Category intelligence</h3>
        <span className="text-[10px] text-text-muted">narrative volume</span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {CATEGORY_BUCKETS.map((b) => {
          const count = counts.get(b) ?? 0;
          const intensity = Number((0.12 + (count / max) * 0.85).toFixed(3));
          const on = active.has(b);
          const color = colorForBucket(b);
          return (
            <button
              key={b}
              onClick={() => onToggle(b)}
              aria-pressed={on}
              className={`group rounded-card border p-2 text-left transition ${on ? 'border-electric' : 'border-border hover:border-border/80'}`}
              title={`${b}: ${count}`}
            >
              <span className="block h-10 w-full rounded-[4px]" style={{ backgroundColor: color, opacity: count === 0 ? 0.1 : intensity }} />
              <span className="mt-1.5 block truncate text-[10px] font-medium text-text-secondary">{b}</span>
              <span className="block text-caption font-bold tabular-nums text-text-primary">{count}</span>
            </button>
          );
        })}
      </div>
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
