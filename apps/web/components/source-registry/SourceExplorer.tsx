'use client';

// =============================================================================
// HSI Phase 46 — Source explorer (client). Debounced search, facet filters
// (status / type / category) with counts, sort, and grouping (type / status /
// category). Source intelligence cards with on-demand detail drawer. Built on the
// cached source-intelligence dataset (no per-keystroke DB hits). Public-safe.
// =============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Input, Button, Select } from '@hsi/ui';
import { Search, X, SlidersHorizontal, Radio, Clock } from 'lucide-react';
import { colorForBucket, type CategoryBucket } from '@/lib/public-intelligence-mapping';
import type { SourceIntelItem, SourceTypeBucket, SourceStatusLabel } from '@/lib/source-intelligence';
import { SourceDetailDrawer } from './SourceDetailDrawer';

const STATUS_VALUES: SourceStatusLabel[] = ['Active', 'Paused', 'Disabled', 'Failing'];
const TYPE_VALUES: SourceTypeBucket[] = ['Websites', 'YouTube', 'Podcasts', 'RSS', 'Social', 'Documents', 'Other'];
const CATS: CategoryBucket[] = ['Influence', 'Recruitment', 'Misinformation', 'Propaganda', 'Extremism', 'Other'];
const STATUS_COLOR: Record<string, string> = { Active: '#10B981', Paused: '#F59E0B', Disabled: '#94A3B8', Failing: '#EF4444' };
const PAGE = 12;

type Sort = 'signals' | 'health' | 'trust' | 'recent' | 'name';
type Group = 'none' | 'type' | 'status' | 'category';

export function SourceExplorer({ sources }: { sources: SourceIntelItem[] }) {
  const [rawQuery, setRawQuery] = useState('');
  const [query, setQuery] = useState('');
  const [statuses, setStatuses] = useState<Set<SourceStatusLabel>>(new Set());
  const [types, setTypes] = useState<Set<SourceTypeBucket>>(new Set());
  const [cats, setCats] = useState<Set<CategoryBucket>>(new Set());
  const [sort, setSort] = useState<Sort>('signals');
  const [group, setGroup] = useState<Group>('none');
  const [visible, setVisible] = useState(PAGE);
  const [open, setOpen] = useState<SourceIntelItem | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setQuery(rawQuery.trim().toLowerCase()), 200);
    return () => clearTimeout(id);
  }, [rawQuery]);

  const tokens = useMemo(() => query.split(/\s+/).filter(Boolean), [query]);

  const filtered = useMemo(() => {
    const out = sources.filter((s) => {
      if (statuses.size && !statuses.has(s.status)) return false;
      if (types.size && !types.has(s.type)) return false;
      if (cats.size && !cats.has(s.coverageCategory)) return false;
      if (tokens.length) {
        const hay = `${s.name} ${s.type} ${s.status} ${s.coverageCategory}`.toLowerCase();
        if (!tokens.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
    out.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'health') return b.healthScore - a.healthScore;
      if (sort === 'trust') return b.trustScore - a.trustScore;
      if (sort === 'recent') return b.recentSignals - a.recentSignals;
      return b.signals - a.signals;
    });
    return out;
  }, [sources, statuses, types, cats, tokens, sort]);

  useEffect(() => { setVisible(PAGE); }, [query, statuses, types, cats, sort, group]);

  const groups = useMemo(() => {
    if (group === 'none') return null;
    const m = new Map<string, SourceIntelItem[]>();
    for (const s of filtered) {
      const key = group === 'type' ? s.type : group === 'status' ? s.status : s.coverageCategory;
      const arr = m.get(key) ?? [];
      arr.push(s);
      m.set(key, arr);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filtered, group]);

  function toggle<T>(set: Set<T>, value: T, apply: (s: Set<T>) => void) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value); else next.add(value);
    apply(next);
  }
  function clearAll() { setStatuses(new Set()); setTypes(new Set()); setCats(new Set()); setRawQuery(''); }
  const activeFilters = statuses.size + types.size + cats.size;
  const hasData = sources.length > 0;

  const count = (pred: (s: SourceIntelItem) => boolean) => sources.filter(pred).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <Input value={rawQuery} onChange={(e) => setRawQuery(e.target.value)} placeholder="Search sources…" className="pl-9" aria-label="Search sources" />
        </div>
        <Facet title="Status" values={STATUS_VALUES} selected={statuses} accent={(k) => STATUS_COLOR[k]} count={(k) => count((s) => s.status === k)} onToggle={(k) => toggle(statuses, k, setStatuses)} />
        <Facet title="Source type" values={TYPE_VALUES} selected={types} accent={() => '#3B82F6'} count={(k) => count((s) => s.type === k)} onToggle={(k) => toggle(types, k, setTypes)} />
        <Facet title="Coverage category" values={CATS} selected={cats} accent={(k) => colorForBucket(k as CategoryBucket)} count={(k) => count((s) => s.coverageCategory === k)} onToggle={(k) => toggle(cats, k, setCats)} />
        {activeFilters > 0 || query ? (
          <button onClick={clearAll} className="inline-flex items-center gap-1.5 text-caption font-medium text-electric hover:text-white"><X className="h-3.5 w-3.5" /> Clear all filters</button>
        ) : null}
      </aside>

      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-caption text-text-muted">
            <SlidersHorizontal className="mr-1.5 inline h-3.5 w-3.5" />
            {hasData ? <><span className="font-semibold text-text-secondary">{filtered.length}</span> of {sources.length} sources</> : 'Registered sources'}
          </p>
          <div className="flex items-center gap-2 text-caption text-text-muted">
            <label className="flex items-center gap-1.5">Group
              <Select value={group} onChange={(e) => setGroup(e.target.value as Group)} className="w-32" aria-label="Group sources">
                <option value="none">None</option>
                <option value="type">Type</option>
                <option value="status">Health</option>
                <option value="category">Category</option>
              </Select>
            </label>
            <label className="flex items-center gap-1.5">Sort
              <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="w-40" aria-label="Sort sources">
                <option value="signals">Signal yield</option>
                <option value="recent">Recent activity</option>
                <option value="health">Health score</option>
                <option value="trust">Reliability</option>
                <option value="name">Name</option>
              </Select>
            </label>
          </div>
        </div>

        {!hasData ? (
          <Empty title="No sources registered yet." hint="Registered intelligence sources will appear here." />
        ) : filtered.length === 0 ? (
          <Empty title="No sources match your filters." hint="Try clearing a filter or broadening your search." />
        ) : groups ? (
          <div className="space-y-6">
            {groups.map(([key, items]) => (
              <div key={key} className="space-y-3">
                <h3 className="flex items-center gap-2 text-body-sm font-semibold text-text-primary">
                  {key} <span className="rounded-full bg-surface-2/60 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-text-secondary">{items.length}</span>
                </h3>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((s) => <SourceCard key={s.id} source={s} onOpen={() => setOpen(s)} />)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.slice(0, visible).map((s) => <SourceCard key={s.id} source={s} onOpen={() => setOpen(s)} />)}
            </div>
            {filtered.length > visible ? (
              <div className="flex justify-center pt-2"><Button variant="secondary" onClick={() => setVisible((v) => v + PAGE)}>Load more sources</Button></div>
            ) : null}
          </>
        )}
      </div>

      <SourceDetailDrawer source={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function SourceCard({ source, onOpen }: { source: SourceIntelItem; onOpen: () => void }) {
  return (
    <div
      role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="group flex cursor-pointer flex-col gap-3 rounded-card border border-border bg-surface/60 p-4 transition hover:-translate-y-0.5 hover:border-electric/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-electric/70"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-border bg-surface-2/50 px-2 py-0.5 text-[10px] font-medium text-text-secondary">{source.type}</span>
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `${STATUS_COLOR[source.status]}1f`, color: STATUS_COLOR[source.status] }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_COLOR[source.status] }} />{source.status}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-text-muted">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colorForBucket(source.coverageCategory) }} />{source.coverageCategory}
        </span>
      </div>
      <h3 className="truncate text-h6 font-semibold text-text-primary" title={source.name}>{source.name}</h3>
      <div className="flex items-center justify-between text-caption text-text-muted">
        <span className="inline-flex items-center gap-1"><Radio className="h-3.5 w-3.5" /> {source.signals.toLocaleString('en-US')} signals</span>
        <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {source.lastActivityLabel}</span>
      </div>
      <div className="mt-auto grid grid-cols-2 gap-2 border-t border-border pt-3">
        <Mini label="Trust" value={source.trustScore} color="#3B82F6" />
        <Mini label="Health" value={source.healthScore} color="#10B981" />
      </div>
    </div>
  );
}

function Mini({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wide text-text-muted">{label}</span>
        <span className="text-caption font-bold tabular-nums" style={{ color }}>{value}</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function Facet<T extends string>({ title, values, selected, accent, count, onToggle }: {
  title: string; values: T[]; selected: Set<T>; accent: (k: T) => string; count: (k: T) => number; onToggle: (k: T) => void;
}) {
  return (
    <div className="rounded-card border border-border bg-surface/40 p-3">
      <h3 className="mb-2 text-label uppercase tracking-wide text-text-muted">{title}</h3>
      <ul className="space-y-1">
        {values.map((v) => {
          const on = selected.has(v);
          return (
            <li key={v}>
              <button onClick={() => onToggle(v)} aria-pressed={on}
                className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-body-sm transition ${on ? 'bg-electric/15 font-semibold text-text-primary' : 'text-text-secondary hover:bg-surface-2'}`}>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accent(v), opacity: on ? 1 : 0.6 }} />{v}
                </span>
                <span className="tabular-nums text-caption text-text-muted">{count(v)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-card border border-dashed border-border/70 bg-background-deep/30 px-6 py-14 text-center">
      <p className="text-body font-medium text-text-secondary">{title}</p>
      <p className="mt-1 text-caption text-text-muted">{hint}</p>
    </div>
  );
}
