'use client';

// =============================================================================
// HSI Phase 48 — Investigation queue + case workspace (client). A sortable,
// filterable operational queue of cases rendered as investigation cards. Built on
// the cached library dataset (no per-keystroke DB hits). Opens the case drawer on
// demand. Public-safe.
// =============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Input, Select, Button, RiskBadge, CategoryTag, TraceabilityBadge } from '@hsi/ui';
import { Search, FileText, ClipboardCheck, Clock } from 'lucide-react';
import { riskTier, toneForBucket, type CategoryBucket, type RiskTier } from '@/lib/public-intelligence-mapping';
import type { PublicLibrarySignal, LibraryStatus } from '@/lib/public-intelligence';
import { CaseDrawer } from './CaseDrawer';

const PAGE = 9;
type Sort = 'priority' | 'recent' | 'oldest' | 'traceability';

export function InvestigationQueue({ cases }: { cases: PublicLibrarySignal[] }) {
  const [rawQuery, setRawQuery] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | LibraryStatus>('all');
  const [risk, setRisk] = useState<'all' | RiskTier>('all');
  const [category, setCategory] = useState<'all' | CategoryBucket>('all');
  const [sort, setSort] = useState<Sort>('priority');
  const [visible, setVisible] = useState(PAGE);
  const [open, setOpen] = useState<PublicLibrarySignal | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setQuery(rawQuery.trim().toLowerCase()), 200);
    return () => clearTimeout(id);
  }, [rawQuery]);

  const tokens = useMemo(() => query.split(/\s+/).filter(Boolean), [query]);

  const filtered = useMemo(() => {
    const out = cases.filter((c) => {
      if (status !== 'all' && c.status !== status) return false;
      if (risk !== 'all' && riskTier(c.risk_level) !== risk) return false;
      if (category !== 'all' && c.category !== category) return false;
      if (tokens.length) {
        const hay = `${c.title} ${c.summary} ${c.category} ${c.status}`.toLowerCase();
        if (!tokens.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
    out.sort((a, b) => {
      if (sort === 'priority') return b.risk_level - a.risk_level || (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '');
      if (sort === 'recent') return (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '');
      if (sort === 'oldest') return (a.publishedAt ?? '').localeCompare(b.publishedAt ?? '');
      return (b.traceabilityScore ?? -1) - (a.traceabilityScore ?? -1);
    });
    return out;
  }, [cases, status, risk, category, tokens, sort]);

  useEffect(() => { setVisible(PAGE); }, [query, status, risk, category, sort]);

  const shown = filtered.slice(0, visible);
  const hasData = cases.length > 0;

  return (
    <div className="space-y-4">
      {/* filter / sort bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <Input value={rawQuery} onChange={(e) => setRawQuery(e.target.value)} placeholder="Search investigations…" className="pl-9" aria-label="Search investigations" />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="w-36" aria-label="Status">
          <option value="all">Any status</option>
          <option value="Published">Published</option>
          <option value="Archived">Archived</option>
        </Select>
        <Select value={risk} onChange={(e) => setRisk(e.target.value as typeof risk)} className="w-36" aria-label="Risk">
          <option value="all">Any risk</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Moderate">Moderate</option>
          <option value="Low">Low</option>
        </Select>
        <Select value={category} onChange={(e) => setCategory(e.target.value as typeof category)} className="w-40" aria-label="Category">
          <option value="all">Any category</option>
          <option value="Influence">Influence</option>
          <option value="Recruitment">Recruitment</option>
          <option value="Misinformation">Misinformation</option>
          <option value="Propaganda">Propaganda</option>
          <option value="Extremism">Extremism</option>
          <option value="Other">Other</option>
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="w-44" aria-label="Sort">
          <option value="priority">Sort: Priority</option>
          <option value="recent">Sort: Most recent</option>
          <option value="oldest">Sort: Oldest first</option>
          <option value="traceability">Sort: Traceability</option>
        </Select>
      </div>

      <p className="text-caption text-text-muted">
        {hasData ? <><span className="font-semibold text-text-secondary">{Math.min(visible, filtered.length)}</span> of <span className="font-semibold text-text-secondary">{filtered.length}</span> investigations</> : 'Investigation queue'}
      </p>

      {!hasData ? (
        <Empty title="No investigations yet." hint="Cases appear here as signals progress through the pipeline and publish." />
      ) : filtered.length === 0 ? (
        <Empty title="No investigations match your filters." hint="Try clearing a filter or broadening your search." />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((c) => <CaseCard key={c.id} item={c} onOpen={() => setOpen(c)} />)}
          </div>
          {filtered.length > visible ? (
            <div className="flex justify-center pt-2"><Button variant="secondary" onClick={() => setVisible((v) => v + PAGE)}>Load more</Button></div>
          ) : null}
        </>
      )}

      <CaseDrawer item={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function CaseCard({ item, onOpen }: { item: PublicLibrarySignal; onOpen: () => void }) {
  return (
    <div
      role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="group flex cursor-pointer flex-col gap-3 rounded-card border border-border bg-surface/60 p-4 transition hover:-translate-y-0.5 hover:border-electric/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-electric/70"
    >
      <div className="flex flex-wrap items-center gap-2">
        <CategoryTag label={item.category} tone={toneForBucket(item.category)} />
        <RiskBadge level={item.risk_level} />
        {typeof item.traceabilityScore === 'number' ? <TraceabilityBadge score={item.traceabilityScore} className="ml-auto" /> : null}
      </div>
      <h3 className="line-clamp-2 text-body font-semibold leading-snug text-text-primary">{item.title}</h3>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3 text-caption text-text-muted">
        <span className="inline-flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> {item.evidenceCount} evidence</span>
        <span className="inline-flex items-center gap-1"><ClipboardCheck className="h-3.5 w-3.5" /> {item.reviewStatus ?? 'Cleared'}</span>
      </div>
      <div className="flex items-center justify-between text-caption text-text-muted">
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2/40 px-2 py-0.5">{item.status}</span>
        <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {item.dateLabel}</span>
      </div>
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
